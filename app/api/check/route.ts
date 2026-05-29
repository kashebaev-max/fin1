import { NextRequest, NextResponse } from "next/server";
import { analyzeBinLocally } from "@/lib/kz-bin";
import { lookupOrganizationByBin } from "@/lib/bin-name-lookup";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Ты — система предварительной проверки контрагентов в Казахстане по БИН (12 цифр).
Отвечай ТОЛЬКО валидным JSON без markdown.
НИКОГДА не выдумывай наименование организации — поле organization_name оставь пустой строкой "".
Структура:
{
  "bin": "строка",
  "valid": true,
  "type": "ТОО/АО/ИП/...",
  "registration_date": "ММ.ГГГГ",
  "organization_name": "",
  "checks": [{"name":"...","status":"ok|warning|error|info","detail":"..."}],
  "risk_level": "low|medium|high|unknown",
  "recommendations": ["..."],
  "links": [{"name":"...","url":"..."}]
}`;

function extractJson(text: string): unknown | null {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function mergeNameFields(
  base: ReturnType<typeof analyzeBinLocally>,
  nameInfo: Awaited<ReturnType<typeof lookupOrganizationByBin>>
) {
  const organization_name = nameInfo.organization_name || base.organization_name || null;
  const name_source = nameInfo.name_source || base.name_source || null;

  const checks = base.checks.filter((c) => c.name !== "Наименование");
  if (organization_name) {
    const detail = [organization_name, name_source ? `Источник: ${name_source}` : ""].filter(Boolean).join(" · ");
    checks.unshift({ name: "Наименование", status: "ok", detail });
  } else {
    checks.unshift({
      name: "Наименование",
      status: "info",
      detail:
        "Не найдено в открытом API. Откройте ссылку «Стат. реестр» ниже или добавьте контрагента в справочник Finstat.",
    });
  }

  return {
    ...base,
    organization_name,
    name_source,
    address: nameInfo.address || base.address || null,
    director: nameInfo.director || base.director || null,
    checks,
  };
}

function normalizeResponse(
  bin: string,
  raw: unknown,
  nameInfo: Awaited<ReturnType<typeof lookupOrganizationByBin>>
) {
  const base = analyzeBinLocally(bin);
  if (!raw || typeof raw !== "object") return mergeNameFields(base, nameInfo);

  const o = raw as Record<string, unknown>;
  return mergeNameFields(
    {
      ...base,
      valid: typeof o.valid === "boolean" ? o.valid : base.valid,
      type: String(o.type || base.type),
      registration_date: String(o.registration_date || base.registration_date),
      checks: Array.isArray(o.checks) && o.checks.length > 0 ? (o.checks as typeof base.checks) : base.checks,
      risk_level: String(o.risk_level || base.risk_level),
      recommendations:
        Array.isArray(o.recommendations) && o.recommendations.length > 0
          ? o.recommendations.map(String)
          : base.recommendations,
      links: Array.isArray(o.links) && o.links.length > 0 ? (o.links as typeof base.links) : base.links,
    },
    nameInfo
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bin = String(body?.bin || "").replace(/\D/g, "");

    let userId: string | null = null;
    try {
      const supabase = await createServerSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      /* без авторизации — только публичные источники */
    }

    const nameInfo = bin.length === 12 ? await lookupOrganizationByBin(bin, userId) : {
      organization_name: null,
      name_source: null,
      address: null,
      director: null,
    };

    if (bin.length !== 12) {
      return NextResponse.json(mergeNameFields(analyzeBinLocally(bin || "000000000000"), nameInfo));
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: `Проверь БИН контрагента: ${bin}` }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.content?.[0]?.text || "";
          const parsed = extractJson(text);
          if (parsed) {
            return NextResponse.json(normalizeResponse(bin, parsed, nameInfo));
          }
        }
      } catch {
        /* локальный анализ */
      }
    }

    return NextResponse.json(mergeNameFields(analyzeBinLocally(bin), nameInfo));
  } catch (e) {
    console.error("[api/check]", e);
    return NextResponse.json({ error: "Ошибка проверки. Попробуйте позже." }, { status: 500 });
  }
}

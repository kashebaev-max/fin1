import { NextRequest, NextResponse } from "next/server";
import { analyzeBinLocally } from "@/lib/kz-bin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Ты — система предварительной проверки контрагентов в Казахстане по БИН (12 цифр).
Отвечай ТОЛЬКО валидным JSON без markdown и без пояснений до/после.
Структура:
{
  "bin": "строка",
  "valid": true,
  "type": "ТОО/АО/ИП/...",
  "registration_date": "ММ.ГГГГ",
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

function normalizeResponse(bin: string, raw: unknown) {
  const local = analyzeBinLocally(bin);
  if (!raw || typeof raw !== "object") return local;

  const o = raw as Record<string, unknown>;
  return {
    bin: String(o.bin || bin),
    valid: typeof o.valid === "boolean" ? o.valid : local.valid,
    type: String(o.type || local.type),
    registration_date: String(o.registration_date || local.registration_date),
    checks: Array.isArray(o.checks) && o.checks.length > 0 ? o.checks : local.checks,
    risk_level: String(o.risk_level || local.risk_level),
    recommendations:
      Array.isArray(o.recommendations) && o.recommendations.length > 0
        ? o.recommendations.map(String)
        : local.recommendations,
    links: Array.isArray(o.links) && o.links.length > 0 ? o.links : local.links,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bin = String(body?.bin || "").replace(/\D/g, "");

    if (bin.length !== 12) {
      return NextResponse.json(analyzeBinLocally(bin || "000000000000"));
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
            return NextResponse.json(normalizeResponse(bin, parsed));
          }
        }
      } catch {
        /* локальный анализ ниже */
      }
    }

    return NextResponse.json(analyzeBinLocally(bin));
  } catch (e) {
    console.error("[api/check]", e);
    return NextResponse.json({ error: "Ошибка проверки. Попробуйте позже." }, { status: 500 });
  }
}

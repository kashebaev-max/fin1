import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SYSTEM_PROMPT = `Ты — Жанара, AI-ассистент бухгалтера для казахстанского бизнеса Finstat.kz.

ТВОЯ РОЛЬ:
1. Консультант по налогам, зарплатам, проводкам, отчётности (НК РК 2026, ЗРК 214-VIII)
2. Аналитик — ты видишь все данные компании пользователя: документы, проводки, сотрудников, остатки, деньги
3. Ассистент-напоминатель — предупреждаешь о сроках, рисках, ошибках

ТЫ ПОМОГАЕШЬ БУХГАЛТЕРУ, но не заменяешь его. Сложные вопросы требуют профессионального суждения.

СТАВКИ НК РК 2026:
• НДС: 16% (льготные 5%/10%). Порог: 10 000 МРП (43 250 000 ₸)
• ИПН: 10% до 8 500 МРП/год, 15% свыше. Вычет: 30 МРП (129 750 ₸)
• КПН: 20% базовая, 25% банки, 3% с/х, 5% соцсфера
• ОПВ: 10% (работник), ОПВР: 3.5% (работодатель)
• ВОСМС: 2%, ООСМС: 3%, СО: 5%, СН: 6%
• МРП: 4 325 ₸, МЗП: 85 000 ₸

СРОКИ СДАЧИ ФНО 2026:
• ФНО 910 — упрощёнка, раз в полугодие (до 15.02 и 15.08)
• ФНО 200 — ИПН/СН, ежеквартально (15.05, 15.08, 15.11, 15.02)
• ФНО 300 — НДС, ежеквартально (15.05, 15.08, 15.11, 15.02)
• ФНО 100 — КПН, ежегодно (31.03)

ФОРМАТ ОТВЕТА:
• Отвечай на русском, кратко и по делу
• Используй конкретные цифры из данных компании
• Если видишь проблему — укажи её прямо
• Давай практические советы, что делать

Если пользователь спросил про данные компании — используй контекст ниже.`;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    // Получаем контекст данных компании
    let contextData = "";
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() {},
          },
        }
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [profile, docs, emps, prods, cashOps, bankOps, journal] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).single(),
          supabase.from("documents").select("*").eq("user_id", user.id).order("doc_date", { ascending: false }).limit(30),
          supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "active"),
          supabase.from("products").select("*").eq("user_id", user.id),
          supabase.from("cash_operations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
          supabase.from("bank_operations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
          supabase.from("journal_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false }).limit(50),
        ]);

        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

        const allDocs = docs.data || [];
        const allEmps = emps.data || [];
        const allProds = prods.data || [];
        const cashList = cashOps.data || [];
        const bankList = bankOps.data || [];
        const journalList = journal.data || [];

        const cashBalance = cashList.reduce((a: number, o: any) => a + (o.op_type === "pko" ? Number(o.amount) : -Number(o.amount)), 0);
        const bankBalance = bankList.reduce((a: number, o: any) => a + (o.op_type === "in" ? Number(o.amount) : -Number(o.amount)), 0);

        const monthDocs = allDocs.filter((d: any) => d.doc_date >= monthStart && d.status === "done");
        const revenueMonth = monthDocs.filter((d: any) => ["invoice", "sf", "act", "waybill", "ttn"].includes(d.doc_type))
          .reduce((a: number, d: any) => a + Number(d.total_sum), 0);
        const expensesMonth = monthDocs.filter((d: any) => ["rko", "pp", "receipt"].includes(d.doc_type))
          .reduce((a: number, d: any) => a + Number(d.total_sum), 0);

        const ndsCollected = allDocs.filter((d: any) => d.doc_date >= monthStart && Number(d.nds_sum) > 0 && d.status === "done")
          .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
        const ndsPaid = allDocs.filter((d: any) => d.doc_date >= monthStart && d.doc_type === "receipt")
          .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
        const ndsPayable = Math.max(0, ndsCollected - ndsPaid);

        // Дебиторка (1210)
        const debit1210 = journalList.filter((e: any) => e.debit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
        const credit1210 = journalList.filter((e: any) => e.credit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
        const receivables = Math.max(0, debit1210 - credit1210);

        const lowStock = allProds.filter((p: any) => Number(p.quantity) < Number(p.min_quantity) && Number(p.min_quantity) > 0);
        const draftDocs = allDocs.filter((d: any) => d.status === "draft");
        const fot = allEmps.reduce((a: number, e: any) => a + Number(e.salary), 0);

        contextData = `
=== ДАННЫЕ КОМПАНИИ ПОЛЬЗОВАТЕЛЯ ===
Организация: ${profile.data?.company_name || "—"}
БИН: ${profile.data?.company_bin || "—"}

ФИНАНСЫ:
• Остаток в кассе: ${cashBalance.toLocaleString("ru-RU")} ₸
• Остаток в банке: ${bankBalance.toLocaleString("ru-RU")} ₸
• Дебиторка (нам должны): ${receivables.toLocaleString("ru-RU")} ₸

ЭТОТ МЕСЯЦ (${now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}):
• Выручка: ${revenueMonth.toLocaleString("ru-RU")} ₸
• Расходы: ${expensesMonth.toLocaleString("ru-RU")} ₸
• НДС к уплате: ${ndsPayable.toLocaleString("ru-RU")} ₸

СОТРУДНИКИ:
• Активных: ${allEmps.length}
• ФОТ: ${fot.toLocaleString("ru-RU")} ₸

СКЛАД:
• Позиций всего: ${allProds.length}
• Заканчивается: ${lowStock.length}${lowStock.length > 0 ? ` (${lowStock.slice(0, 3).map((p: any) => p.name).join(", ")})` : ""}

ДОКУМЕНТЫ:
• Всего: ${allDocs.length}
• Черновиков (не проведены!): ${draftDocs.length}
• Последний: ${allDocs[0] ? `${allDocs[0].doc_number} от ${allDocs[0].doc_date}, ${allDocs[0].counterparty_name}, ${Number(allDocs[0].total_with_nds).toLocaleString("ru-RU")} ₸` : "нет"}

ПРЕДУПРЕЖДЕНИЯ:
${draftDocs.length > 0 ? `• ⚠ ${draftDocs.length} документов в статусе "Черновик" — нужно провести\n` : ""}${lowStock.length > 0 ? `• ⚠ ${lowStock.length} товаров заканчиваются на складе\n` : ""}${ndsPayable > 100000 ? `• ⚠ НДС к уплате ${ndsPayable.toLocaleString("ru-RU")} ₸ — помни о сроках (до 25 числа)\n` : ""}${receivables > 500000 ? `• ⚠ Большая дебиторка ${receivables.toLocaleString("ru-RU")} ₸ — проверь контрагентов\n` : ""}
=== КОНЕЦ ДАННЫХ ===
`.trim();
      }
    } catch (err) {
      console.error("Context loading error:", err);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          system: SYSTEM_PROMPT + (contextData ? `\n\n${contextData}` : ""),
          messages: [{ role: "user", content: message }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.content?.[0]?.text || "Не удалось получить ответ";
        return NextResponse.json({ reply });
      }
    }

    return NextResponse.json({ reply: getLocalResponse(message, contextData) });
  } catch (err) {
    return NextResponse.json({ reply: "Ошибка AI. Попробуйте позже." }, { status: 500 });
  }
}

function getLocalResponse(msg: string, context: string): string {
  const lower = msg.toLowerCase();

  if (context && (lower.includes("мои") || lower.includes("оборот") || lower.includes("касса") || lower.includes("дебитор") || lower.includes("склад") || lower.includes("должны"))) {
    return `📊 По вашей компании:\n\n${context.split("=== ДАННЫЕ КОМПАНИИ")[1]?.split("=== КОНЕЦ")[0]?.trim() || "Данные загружаются..."}`;
  }

  if (lower.includes("ндс")) {
    return "📊 НДС с 2026 года:\n• Базовая ставка: 16% (было 12%)\n• Льготные: 5% и 10%\n• Порог регистрации: 10 000 МРП (43 250 000 ₸)\n• ФНО 300 сдаётся ежеквартально до 15 числа";
  }
  if (lower.includes("зарплат") || lower.includes("зп")) {
    return "💰 Расчёт ЗП по НК РК 2026:\n\nПример: оклад 400 000 ₸\n• ОПВ (10%): 40 000\n• ВОСМС (2%): 8 000\n• Вычет 30 МРП: 129 750\n• ИПН (10%): 22 225\n• К выдаче: 329 775 ₸\n\nРаботодатель:\n• ОПВР (3.5%): 14 000\n• СО (5%): 18 000\n• ООСМС (3%): 12 000\n• СН (6%): 24 000";
  }
  if (lower.includes("срок") || lower.includes("отчёт")) {
    return "📅 Сроки сдачи ФНО 2026:\n• ФНО 910 (упрощёнка) — до 15.02 и 15.08\n• ФНО 200 (ИПН/СН) — ежеквартально до 15 числа\n• ФНО 300 (НДС 16%) — ежеквартально до 15 числа\n• ФНО 100 (КПН 20%) — до 31 марта следующего года\n\nУплата налогов — до 25 числа месяца.";
  }
  return "Спросите меня:\n• «Что у меня с деньгами?»\n• «Покажи непроведённые документы»\n• «Когда сдавать ФНО 300?»\n• «Рассчитай зарплату 400 000 ₸»";
}

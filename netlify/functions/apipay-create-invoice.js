// Создание счёта на оплату через Apipay.kz
// Принимает: { user_id, plan, phone_number }
// Возвращает: { payment_url, invoice_id }

const APIPAY_BASE = "https://bpapi.bazarbay.site/api/v1";

const PLANS = {
  monthly_once: { amount: 10000, description: "Месячная подписка Finstat.kz", days: 30 },
  monthly_recurring: { amount: 10000, description: "Месячная подписка Finstat.kz (автосписание)", days: 30 },
  yearly_once: { amount: 100000, description: "Годовая подписка Finstat.kz", days: 365 },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return "8" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("8")) return digits;
  if (digits.length === 10) return "8" + digits;
  return digits;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.APIPAY_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "APIPAY_API_KEY не задан в Netlify" })
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Supabase credentials не настроены" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { user_id, plan, phone_number } = body;

  if (!user_id || !plan || !phone_number) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "user_id, plan и phone_number обязательны" })
    };
  }

  const planConfig = PLANS[plan];
  if (!planConfig) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Неизвестный тариф: " + plan })
    };
  }

  const phone = normalizePhone(phone_number);
  if (phone.length !== 11) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Неверный формат телефона. Используйте 87XXXXXXXXX" })
    };
  }

  // Уникальный external_order_id для связки с webhook
  const externalOrderId = "fin_" + user_id.slice(0, 8) + "_" + Date.now();

  try {
    let apipayResponse;

    // Подписки (recurring) — отдельный endpoint
    if (plan === "monthly_recurring") {
      apipayResponse = await fetch(APIPAY_BASE + "/subscriptions", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: planConfig.amount,
          phone_number: phone,
          description: planConfig.description,
          billing_period: "monthly",
          external_order_id: externalOrderId
        })
      });
    } else {
      // Однократный счёт
      apipayResponse = await fetch(APIPAY_BASE + "/invoices", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: planConfig.amount,
          phone_number: phone,
          description: planConfig.description,
          external_order_id: externalOrderId
        })
      });
    }

    const apipayData = await apipayResponse.json();

    if (!apipayResponse.ok) {
      return {
        statusCode: apipayResponse.status,
        headers: corsHeaders(),
        body: JSON.stringify({
          error: "Apipay API: " + (apipayData.error || apipayData.message || "Ошибка создания счёта"),
          details: apipayData
        })
      };
    }

    // Извлекаем ID и URL из ответа Apipay
    const invoice = apipayData.invoice || apipayData.subscription || apipayData;
    const invoiceId = invoice.id;
    const paymentUrl = invoice.payment_url || apipayData.payment_url;
    const apipaySubscriptionId = (plan === "monthly_recurring" && invoice.id) ? String(invoice.id) : null;

    // Сохраняем в БД через прямой REST вызов
    const paymentRecord = {
      user_id: user_id,
      amount: planConfig.amount,
      currency: "KZT",
      plan: plan,
      status: "pending",
      apipay_invoice_id: invoiceId ? String(invoiceId) : null,
      apipay_subscription_id: apipaySubscriptionId,
      payment_url: paymentUrl,
      phone_number: phone,
      description: planConfig.description,
      external_order_id: externalOrderId
    };

    const dbResponse = await fetch(supabaseUrl + "/rest/v1/payments", {
      method: "POST",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": "Bearer " + supabaseServiceKey,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(paymentRecord)
    });

    if (!dbResponse.ok) {
      const dbErr = await dbResponse.text();
      console.error("Failed to save payment to DB:", dbErr);
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        payment_url: paymentUrl,
        invoice_id: invoiceId,
        external_order_id: externalOrderId,
        amount: planConfig.amount,
        plan: plan,
        message: "Откройте Kaspi для оплаты"
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: "Ошибка: " + (err && err.message ? err.message : String(err))
      })
    };
  }
};

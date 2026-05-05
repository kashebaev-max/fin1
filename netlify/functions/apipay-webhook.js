// Webhook от Apipay.kz — приходит когда клиент оплатил счёт.
// Активирует подписку, обновляет статус платежа.
// 
// Для безопасности проверяется HMAC-SHA256 подпись из заголовка X-Signature.

const crypto = require("crypto");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  
  // Сравниваем безопасно (timing-safe)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch (e) {
    return false;
  }
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = process.env.APIPAY_WEBHOOK_SECRET;

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Supabase не настроен" })
    };
  }

  // Проверка подписи (если secret настроен)
  if (webhookSecret) {
    const signature = event.headers["x-signature"] || event.headers["X-Signature"];
    if (!verifySignature(event.body || "", signature, webhookSecret)) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Invalid signature" })
      };
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Структура webhook от Apipay:
  // { event: "invoice.paid", invoice: { id, status, amount, external_order_id, ... } }
  // или { event: "subscription.payment_succeeded", subscription: { ... }, invoice: { ... } }

  const eventType = payload.event || "";
  const invoice = payload.invoice || payload.data || payload;
  const externalOrderId = invoice.external_order_id;
  const apipayInvoiceId = invoice.id ? String(invoice.id) : null;
  const status = invoice.status || "";
  const amount = Number(invoice.amount || 0);

  // Логируем все webhooks для дебага
  await fetch(supabaseUrl + "/rest/v1/subscription_events", {
    method: "POST",
    headers: {
      "apikey": supabaseServiceKey,
      "Authorization": "Bearer " + supabaseServiceKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user_id: null,  // пока не знаем юзера
      event_type: "webhook_received",
      payload: payload
    })
  }).catch(function(e) { console.error("Failed to log webhook:", e); });

  // Обрабатываем только успешные оплаты
  if (eventType !== "invoice.paid" && 
      eventType !== "subscription.payment_succeeded" &&
      status !== "paid" && status !== "completed" && status !== "success") {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, processed: false, reason: "Не успешная оплата: " + status })
    };
  }

  // Ищем платёж по external_order_id или apipay_invoice_id
  let paymentQuery = "";
  if (externalOrderId) {
    paymentQuery = "external_order_id=eq." + encodeURIComponent(externalOrderId);
  } else if (apipayInvoiceId) {
    paymentQuery = "apipay_invoice_id=eq." + encodeURIComponent(apipayInvoiceId);
  } else {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Не найден external_order_id или invoice id" })
    };
  }

  const paymentRes = await fetch(
    supabaseUrl + "/rest/v1/payments?" + paymentQuery + "&select=*",
    {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": "Bearer " + supabaseServiceKey
      }
    }
  );

  const payments = await paymentRes.json();

  if (!payments || payments.length === 0) {
    return {
      statusCode: 404,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Платёж не найден в БД" })
    };
  }

  const payment = payments[0];

  // Если уже обработан — игнорируем (idempotency)
  if (payment.status === "completed") {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, processed: false, reason: "Уже обработан" })
    };
  }

  // Обновляем статус платежа
  await fetch(supabaseUrl + "/rest/v1/payments?id=eq." + payment.id, {
    method: "PATCH",
    headers: {
      "apikey": supabaseServiceKey,
      "Authorization": "Bearer " + supabaseServiceKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      status: "completed",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });

  // Продлеваем подписку через RPC функцию
  const extendRes = await fetch(supabaseUrl + "/rest/v1/rpc/extend_subscription", {
    method: "POST",
    headers: {
      "apikey": supabaseServiceKey,
      "Authorization": "Bearer " + supabaseServiceKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_user_id: payment.user_id,
      p_plan: payment.plan,
      p_amount: amount || payment.amount,
      p_apipay_subscription_id: payment.apipay_subscription_id || null
    })
  });

  if (!extendRes.ok) {
    const errText = await extendRes.text();
    console.error("Failed to extend subscription:", errText);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Не удалось продлить подписку: " + errText })
    };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      received: true,
      processed: true,
      user_id: payment.user_id,
      plan: payment.plan,
      message: "Подписка успешно продлена"
    })
  };
};

// Приём просмотра страницы. Добавляет IP/гео и сохраняет в БД.
// Также обновляет user_sessions.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

// Анонимизация IP — берём только /24 (первые 3 октета)
function anonymizeIP(ip) {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return parts[0] + "." + parts[1] + "." + parts[2] + ".0";
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: "Method not allowed" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, headers: corsHeaders(), body: "Supabase not configured" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: "Invalid JSON" };
  }

  // Извлекаем IP из заголовков Netlify
  const clientIP = event.headers["x-nf-client-connection-ip"] || 
                   event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || 
                   "";
  const ipPrefix = anonymizeIP(clientIP);

  // Геолокация из заголовков Netlify (если есть)
  const country = event.headers["x-country"] || event.headers["x-nf-geo"]?.country || null;
  const city = event.headers["x-city"] || null;

  // Записываем page_view
  const pageViewRecord = {
    session_id: body.session_id,
    path: body.path || "/",
    full_url: body.full_url,
    page_title: body.page_title,
    referrer: body.referrer,
    utm_source: body.utm_source,
    utm_medium: body.utm_medium,
    utm_campaign: body.utm_campaign,
    user_agent: body.user_agent,
    device_type: body.device_type,
    browser: body.browser,
    os: body.os,
    screen_width: body.screen_width,
    screen_height: body.screen_height,
    ip_prefix: ipPrefix,
    country: country,
    city: city,
    language: body.language,
  };

  try {
    // 1. Вставляем просмотр
    await fetch(supabaseUrl + "/rest/v1/page_views", {
      method: "POST",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": "Bearer " + supabaseServiceKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(pageViewRecord)
    });

    // 2. Обновляем/создаём user_session
    // Сначала проверяем, существует ли
    const sessionCheck = await fetch(
      supabaseUrl + "/rest/v1/user_sessions?session_id=eq." + encodeURIComponent(body.session_id) + "&select=id,page_views_count",
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": "Bearer " + supabaseServiceKey
        }
      }
    );
    const existing = await sessionCheck.json();

    if (existing && existing.length > 0) {
      // Обновляем существующую сессию
      await fetch(
        supabaseUrl + "/rest/v1/user_sessions?id=eq." + existing[0].id,
        {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": "Bearer " + supabaseServiceKey,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            page_views_count: (existing[0].page_views_count || 0) + 1,
            last_seen: new Date().toISOString(),
            last_path: body.path,
            updated_at: new Date().toISOString()
          })
        }
      );
    } else {
      // Создаём новую сессию
      await fetch(supabaseUrl + "/rest/v1/user_sessions", {
        method: "POST",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": "Bearer " + supabaseServiceKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          session_id: body.session_id,
          first_path: body.path,
          last_path: body.path,
          landing_referrer: body.referrer,
          landing_utm_source: body.utm_source,
          landing_utm_medium: body.utm_medium,
          landing_utm_campaign: body.utm_campaign,
          device_type: body.device_type,
          browser: body.browser,
          os: body.os,
          country: country
        })
      });
    }

    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ""
    };
  } catch (err) {
    console.error("Track page view error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message })
    };
  }
};

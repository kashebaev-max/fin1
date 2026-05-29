// Приём custom events (клики, конверсии).

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
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

  try {
    await fetch(supabaseUrl + "/rest/v1/analytics_events", {
      method: "POST",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": "Bearer " + supabaseServiceKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        session_id: body.session_id,
        event_name: body.event_name,
        event_category: body.event_category,
        event_value: body.event_value,
        path: body.path
      })
    });

    return { statusCode: 204, headers: corsHeaders(), body: "" };
  } catch (err) {
    console.error("Track event error:", err);
    return { statusCode: 500, headers: corsHeaders(), body: "Error" };
  }
};

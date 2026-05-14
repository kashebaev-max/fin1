// Трекинг просмотров страниц и событий для аналитики.

const SESSION_KEY = "finerp_session_id";
const SESSION_DATA_KEY = "finerp_session_data";

// ═══════════════════════════════════════════
// Генерация session ID (хранится в localStorage)
// ═══════════════════════════════════════════

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  
  let sessionId = window.localStorage.getItem(SESSION_KEY);
  
  if (!sessionId) {
    sessionId = generateUUID();
    window.localStorage.setItem(SESSION_KEY, sessionId);
  }
  
  return sessionId;
}

function generateUUID(): string {
  // Простой UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ═══════════════════════════════════════════
// Определение устройства из User Agent
// ═══════════════════════════════════════════

export function detectDevice(): {
  device_type: string;
  browser: string;
  os: string;
} {
  if (typeof window === "undefined") {
    return { device_type: "unknown", browser: "unknown", os: "unknown" };
  }
  
  const ua = navigator.userAgent;
  
  // Device type
  let device_type = "desktop";
  if (/iPad|Android.*Tablet|Kindle|Silk/.test(ua)) device_type = "tablet";
  else if (/Mobile|iPhone|Android.*Mobile/.test(ua)) device_type = "mobile";
  
  // Browser
  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/YaBrowser/.test(ua)) browser = "Yandex";
  
  // OS
  let os = "Unknown";
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";
  
  return { device_type, browser, os };
}

// ═══════════════════════════════════════════
// Парсинг UTM-параметров из URL
// ═══════════════════════════════════════════

export function getUTMParams(): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
} {
  if (typeof window === "undefined") {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
  
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
  };
}

// ═══════════════════════════════════════════
// Главная функция: записать просмотр страницы
// ═══════════════════════════════════════════

export async function trackPageView(path: string, pageTitle?: string): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const sessionId = getOrCreateSessionId();
    const device = detectDevice();
    const utm = getUTMParams();
    
    const referrer = document.referrer || null;
    
    const payload = {
      session_id: sessionId,
      path,
      full_url: window.location.href,
      page_title: pageTitle || document.title,
      referrer,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      user_agent: navigator.userAgent,
      device_type: device.device_type,
      browser: device.browser,
      os: device.os,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      language: navigator.language?.slice(0, 2) || "ru",
    };
    
    // Отправляем через Netlify Function (там добавится IP и геолокация)
    await fetch("/.netlify/functions/track-pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (err) {
    // Тихо — не ломаем UX из-за аналитики
    console.debug("Track pageview failed:", err);
  }
}

// ═══════════════════════════════════════════
// Записать custom event (клик, конверсия)
// ═══════════════════════════════════════════

export async function trackEvent(
  eventName: string,
  category: string = "engagement",
  value?: any
): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const sessionId = getOrCreateSessionId();
    
    await fetch("/.netlify/functions/track-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        event_name: eventName,
        event_category: category,
        event_value: value || null,
        path: window.location.pathname,
      }),
      keepalive: true,
    });
  } catch (err) {
    console.debug("Track event failed:", err);
  }
}

// ═══════════════════════════════════════════
// Форматирование
// ═══════════════════════════════════════════

export function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function formatPercent(n: number): string {
  return n.toFixed(2) + "%";
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffH / 24);
  
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return diffMin + " мин назад";
  if (diffH < 24) return diffH + " ч назад";
  if (diffDay < 7) return diffDay + " дн назад";
  return d.toLocaleDateString("ru-RU");
}

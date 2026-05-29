-- ═══════════════════════════════════════════════════════════════
-- Аналитика пустая в админке: доступ для платформенного админа
-- Выполните в Supabase → SQL Editor (после fix_admin_see_users)
-- ═══════════════════════════════════════════════════════════════

-- Сколько записей в базе (должно быть > 0, если трекинг работал)
SELECT 'page_views' AS таблица, count(*) AS записей FROM page_views
UNION ALL
SELECT 'user_sessions', count(*) FROM user_sessions;

-- ─── page_views ───
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admin read page_views" ON page_views;
CREATE POLICY "Platform admin read page_views" ON page_views
  FOR SELECT
  USING (public.is_platform_admin());

-- ─── user_sessions ───
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admin read user_sessions" ON user_sessions;
CREATE POLICY "Platform admin read user_sessions" ON user_sessions
  FOR SELECT
  USING (public.is_platform_admin());

-- ─── analytics_events (если есть) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'analytics_events') THEN
    EXECUTE 'ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Platform admin read analytics_events" ON analytics_events';
    EXECUTE 'CREATE POLICY "Platform admin read analytics_events" ON analytics_events FOR SELECT USING (public.is_platform_admin())';
  END IF;
END $$;

-- ─── Сводка для дашборда (RPC) ───
-- Старая версия функции с другим форматом — удаляем перед созданием
DROP FUNCTION IF EXISTS public.get_analytics_summary(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_analytics_summary(
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE (
  total_views bigint,
  unique_visitors bigint,
  registered_users bigint,
  paying_users bigint,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH views AS (
    SELECT count(*)::bigint AS total_views,
           count(DISTINCT session_id)::bigint AS unique_visitors
    FROM page_views
    WHERE created_at >= p_start_date AND created_at <= p_end_date
  ),
  regs AS (
    SELECT count(*)::bigint AS registered_users
    FROM profiles
    WHERE created_at >= p_start_date AND created_at <= p_end_date
      AND COALESCE(is_platform_admin, false) = false
  ),
  pays AS (
    SELECT count(DISTINCT user_id)::bigint AS paying_users
    FROM payments
    WHERE status = 'completed'
      AND created_at >= p_start_date AND created_at <= p_end_date
  )
  SELECT
    v.total_views,
    v.unique_visitors,
    r.registered_users,
    p.paying_users,
    CASE
      WHEN v.unique_visitors > 0
      THEN round((r.registered_users::numeric / v.unique_visitors::numeric) * 100, 2)
      ELSE 0
    END AS conversion_rate
  FROM views v, regs r, pays p;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(timestamptz, timestamptz) TO service_role;

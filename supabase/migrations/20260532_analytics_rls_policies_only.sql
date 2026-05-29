-- Если карточки KPI есть, а графики пустые — выполните это (права на чтение таблиц)
-- Можно вместе с деплоем нового API — тогда SQL не обязателен.

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform admin read page_views" ON page_views;
CREATE POLICY "Platform admin read page_views" ON page_views
  FOR SELECT USING (public.is_platform_admin());

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform admin read user_sessions" ON user_sessions;
CREATE POLICY "Platform admin read user_sessions" ON user_sessions
  FOR SELECT USING (public.is_platform_admin());

SELECT count(*) AS page_views FROM page_views;
SELECT count(*) AS user_sessions FROM user_sessions;

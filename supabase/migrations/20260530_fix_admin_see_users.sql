-- ═══════════════════════════════════════════════════════════════
-- ИСПРАВЛЕНИЕ: «пропали пользователи» в админке после миграции
-- Пользователи НЕ удалены — их не видно из‑за RLS.
-- Выполните в Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Проверка: сколько пользователей в базе (должно быть > 0)
SELECT count(*) AS всего_профилей FROM profiles;

SELECT id, email, full_name, is_platform_admin, role, created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 20;

-- 2. Платформенный админ: доступ по email из профиля И из JWT (вход)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        COALESCE(p.is_platform_admin, false) = true
        OR lower(trim(coalesce(p.email, ''))) = 'kashebaev@gmail.com'
        OR lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'kashebaev@gmail.com'
      )
  );
$$;

-- 3. Ваш аккаунт — всегда платформенный админ (по email)
UPDATE profiles
SET
  is_platform_admin = true,
  role = 'user',
  is_blocked = false
WHERE lower(trim(email)) = 'kashebaev@gmail.com'
   OR lower(trim(email)) LIKE '%kashebaev%';

-- Если входите под другим email — раскомментируйте и подставьте id из Authentication → Users:
-- UPDATE profiles SET is_platform_admin = true WHERE id = 'ВАШ-UUID-ЗДЕСЬ';

-- 4. Политики: админ видит ВСЕХ, обычный пользователь — только себя
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Platform admin read all profiles" ON profiles;

CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_platform_admin()
  );

-- UPDATE для админа (блокировка и т.д.)
DROP POLICY IF EXISTS "Platform admin update profiles" ON profiles;
CREATE POLICY "profiles_update_own_or_admin" ON profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.is_platform_admin()
  );

-- 5. Повторная проверка
SELECT count(*) AS видно_админу FROM profiles;
-- После входа под kashebaev@gmail.com в админке снова будут все клиенты.

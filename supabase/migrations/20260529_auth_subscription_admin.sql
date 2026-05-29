-- ═══════════════════════════════════════════════════════════════
-- Finstat.kz: регистрация, триал, платформенный админ, блокировка
-- Выполните в Supabase → SQL Editor (один раз)
-- ═══════════════════════════════════════════════════════════════

-- ─── Профили: платформенный админ и блокировка ───
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- Роль = только «пользователь сервиса» (не сотрудник вашей компании)
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'user';

-- Снять «админа» у всех клиентов (раньше default был admin)
UPDATE profiles
SET role = 'user', is_platform_admin = false
WHERE email IS DISTINCT FROM 'kashebaev@gmail.com'
  AND COALESCE(is_platform_admin, false) = false;

UPDATE profiles
SET is_platform_admin = true, role = 'user', is_blocked = false
WHERE email = 'kashebaev@gmail.com';

-- ─── Подписки ───
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'suspended')),
  plan TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial', 'monthly_once', 'monthly_recurring', 'yearly_once')),
  trial_ends_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_recurring BOOLEAN DEFAULT false,
  total_paid NUMERIC(15,2) DEFAULT 0,
  apipay_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  plan TEXT,
  description TEXT,
  apipay_invoice_id TEXT,
  apipay_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Проверка: платформенный админ
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_platform_admin = true
        OR lower(p.email) = 'kashebaev@gmail.com'
      )
  );
$$;

-- ─── RLS: profiles ───
DROP POLICY IF EXISTS "Platform admin read all profiles" ON profiles;
CREATE POLICY "Platform admin read all profiles" ON profiles
  FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin update profiles" ON profiles;
CREATE POLICY "Platform admin update profiles" ON profiles
  FOR UPDATE USING (public.is_platform_admin());

-- ─── RLS: subscriptions ───
DROP POLICY IF EXISTS "Users read own subscription" ON subscriptions;
CREATE POLICY "Users read own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Platform admin manage subscriptions" ON subscriptions;
CREATE POLICY "Platform admin manage subscriptions" ON subscriptions
  FOR ALL USING (public.is_platform_admin());

-- ─── RLS: payments ───
DROP POLICY IF EXISTS "Users read own payments" ON payments;
CREATE POLICY "Users read own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Platform admin read payments" ON payments;
CREATE POLICY "Platform admin read payments" ON payments
  FOR SELECT USING (public.is_platform_admin());

-- ─── Триггер: профиль + триал 30 дней при регистрации ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  v_is_owner := lower(NEW.email) = 'kashebaev@gmail.com';

  INSERT INTO profiles (
    id, email, full_name, company_name, phone,
    role, is_platform_admin, is_blocked
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'user',
    v_is_owner,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    company_name = COALESCE(NULLIF(EXCLUDED.company_name, ''), profiles.company_name),
    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), profiles.phone);

  INSERT INTO subscriptions (user_id, status, plan, trial_ends_at, expires_at)
  VALUES (
    NEW.id,
    'trial',
    'trial',
    NOW() + INTERVAL '30 days',
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Триал для уже зарегистрированных без подписки
INSERT INTO subscriptions (user_id, status, plan, trial_ends_at, expires_at)
SELECT
  p.id,
  'trial',
  'trial',
  COALESCE(p.created_at, NOW()) + INTERVAL '30 days',
  COALESCE(p.created_at, NOW()) + INTERVAL '30 days'
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.id)
  AND COALESCE(p.is_platform_admin, false) = false;

-- Обращения пользователей в поддержку (виджет на сайте → админ)
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  name TEXT,
  company_name TEXT,
  category TEXT NOT NULL DEFAULT 'question'
    CHECK (category IN ('question', 'problem', 'suggestion', 'billing', 'other')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'resolved')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_status_idx ON public.support_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_user_idx ON public.support_messages (user_id);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Пользователь создаёт обращение от своего имени (работает даже при истёкшей подписке)
DROP POLICY IF EXISTS "support_messages_insert_own" ON public.support_messages;
CREATE POLICY "support_messages_insert_own"
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Пользователь видит свои обращения
DROP POLICY IF EXISTS "support_messages_select_own" ON public.support_messages;
CREATE POLICY "support_messages_select_own"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Платформенный админ видит все обращения
DROP POLICY IF EXISTS "support_messages_select_admin" ON public.support_messages;
CREATE POLICY "support_messages_select_admin"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Платформенный админ меняет статус / заметки
DROP POLICY IF EXISTS "support_messages_update_admin" ON public.support_messages;
CREATE POLICY "support_messages_update_admin"
  ON public.support_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.support_messages IS 'Обращения пользователей из виджета поддержки; уведомление админу на email';

-- ═══════════════════════════════════════════════════════════════
-- Фаза 1: блокировка записи при истёкшей подписке (RLS)
-- Клиент может ЧИТАТЬ свои данные, но не создавать/менять без триала/подписки
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.subscription_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status IN ('trial', 'active')
        AND (s.expires_at IS NULL OR s.expires_at > now())
    );
$$;

-- Таблицы с user_id, где нужна защита записи
DO $$
DECLARE
  t TEXT;
  pol RECORD;
  pol_name TEXT;
  tables TEXT[] := ARRAY[
    'documents', 'journal_entries', 'employees', 'products', 'counterparties',
    'cash_operations', 'bank_operations', 'nomenclature', 'orders', 'contracts',
    'user_companies', 'esf_documents', 'fno_declarations', 'stock_batches',
    'batch_movements', 'assembly_operations', 'business_trips', 'budgets',
    'budget_items', 'budget_lines', 'cfo_units', 'bank_statements', 'bank_statement_lines',
    'currency_rates', 'currency_operations', 'crm_leads', 'crm_deals', 'crm_tasks',
    'crm_events', 'discounts', 'loyalty_cards', 'loyalty_transactions',
    'salary_deductions', 'deduction_history', 'inventory_acts', 'pos_shifts',
    'pos_receipts', 'migration_jobs', 'document_scans', 'counterparty_contacts',
    'counterparty_notes', 'payment_schedules', 'fixed_assets', 'production_orders',
    'production_outputs', 'transport_vehicles', 'transport_waybills', 'retail_stores',
    'retail_shifts', 'workflow_instances', 'recurring_documents', 'edo_documents',
    'chat_messages', 'ai_actions_log', 'module_preferences',
    'scheduled_tasks', 'task_runs', 'notifications', 'notification_runs',
    'ai_insights', 'ai_business_snapshot'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Снять старые политики FOR ALL (иначе запись останется разрешённой)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname NOT LIKE 'sub_guard_%'
        AND policyname NOT LIKE 'Platform admin%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    pol_name := 'sub_guard_select_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)',
      pol_name, t
    );

    pol_name := 'sub_guard_insert_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id AND public.subscription_is_active())',
      pol_name, t
    );

    pol_name := 'sub_guard_update_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id AND public.subscription_is_active())',
      pol_name, t
    );

    pol_name := 'sub_guard_delete_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id AND public.subscription_is_active())',
      pol_name, t
    );
  END LOOP;
END $$;

-- Профиль: читать/править свои реквизиты можно всегда
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

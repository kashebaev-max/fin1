-- ═══════════════════════════════════════════
-- FinERP — Схема базы данных
-- НК РК 2026 (ЗРК 214-VIII)
-- ═══════════════════════════════════════════

-- Профили пользователей
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  company_bin TEXT DEFAULT '',
  company_address TEXT DEFAULT '',
  director_name TEXT DEFAULT '',
  accountant_name TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_iik TEXT DEFAULT '',
  bank_bik TEXT DEFAULT '',
  bank_kbe TEXT DEFAULT '17',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'accountant', 'manager', 'employee')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Автосоздание профиля при регистрации
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Контрагенты
CREATE TABLE IF NOT EXISTS counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bin TEXT DEFAULT '',
  address TEXT DEFAULT '',
  iik TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_bik TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  type TEXT DEFAULT 'both' CHECK (type IN ('buyer', 'supplier', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own counterparties" ON counterparties FOR ALL USING (auth.uid() = user_id);

-- Товары/Услуги
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'шт',
  price NUMERIC(15,2) DEFAULT 0,
  quantity NUMERIC(15,2) DEFAULT 0,
  min_quantity NUMERIC(15,2) DEFAULT 0,
  category TEXT DEFAULT 'goods' CHECK (category IN ('goods', 'materials', 'services')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own products" ON products FOR ALL USING (auth.uid() = user_id);

-- Документы
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  counterparty_name TEXT DEFAULT '',
  total_sum NUMERIC(15,2) DEFAULT 0,
  nds_sum NUMERIC(15,2) DEFAULT 0,
  nds_rate NUMERIC(5,4) DEFAULT 0.16,
  total_with_nds NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'done', 'cancelled')),
  items JSONB DEFAULT '[]',
  extra_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON documents FOR ALL USING (auth.uid() = user_id);

-- Сотрудники
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  iin TEXT DEFAULT '',
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  salary NUMERIC(15,2) DEFAULT 0,
  hire_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'fired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own employees" ON employees FOR ALL USING (auth.uid() = user_id);

-- Журнал проводок
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  doc_ref TEXT DEFAULT '',
  debit_account TEXT NOT NULL,
  credit_account TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own journal" ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- Кассовые операции
CREATE TABLE IF NOT EXISTS cash_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL CHECK (op_type IN ('pko', 'rko')),
  op_number TEXT NOT NULL,
  op_date DATE NOT NULL DEFAULT CURRENT_DATE,
  counterparty_name TEXT DEFAULT '',
  amount NUMERIC(15,2) NOT NULL,
  basis TEXT DEFAULT '',
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cash_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cash ops" ON cash_operations FOR ALL USING (auth.uid() = user_id);

-- Банковские операции
CREATE TABLE IF NOT EXISTS bank_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL CHECK (op_type IN ('in', 'out')),
  op_number TEXT NOT NULL,
  op_date DATE NOT NULL DEFAULT CURRENT_DATE,
  counterparty_name TEXT DEFAULT '',
  amount NUMERIC(15,2) NOT NULL,
  purpose TEXT DEFAULT '',
  balance_after NUMERIC(15,2) DEFAULT 0,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank ops" ON bank_operations FOR ALL USING (auth.uid() = user_id);

-- Нумерация документов
CREATE TABLE IF NOT EXISTS doc_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  current_number INTEGER DEFAULT 0,
  prefix TEXT DEFAULT '',
  year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  UNIQUE(user_id, doc_type, year)
);

ALTER TABLE doc_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sequences" ON doc_sequences FOR ALL USING (auth.uid() = user_id);

-- Функция получения следующего номера документа
CREATE OR REPLACE FUNCTION next_doc_number(p_user_id UUID, p_doc_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_num INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_prefix TEXT;
BEGIN
  INSERT INTO doc_sequences (user_id, doc_type, current_number, prefix, year)
  VALUES (p_user_id, p_doc_type, 1, UPPER(LEFT(p_doc_type, 3)), v_year)
  ON CONFLICT (user_id, doc_type, year) DO UPDATE SET current_number = doc_sequences.current_number + 1
  RETURNING current_number, prefix INTO v_num, v_prefix;
  
  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

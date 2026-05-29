-- Кэш наименований по БИН из гос. реестра (заполняется сервером при успешном API-запросе)
CREATE TABLE IF NOT EXISTS public.bin_registry_cache (
  bin TEXT PRIMARY KEY CHECK (char_length(bin) = 12),
  organization_name TEXT NOT NULL,
  name_source TEXT,
  address TEXT,
  director TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bin_registry_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bin_registry_cache_select" ON public.bin_registry_cache;
CREATE POLICY "bin_registry_cache_select"
  ON public.bin_registry_cache
  FOR SELECT
  TO authenticated, anon
  USING (true);

COMMENT ON TABLE public.bin_registry_cache IS 'Публичные наименования ЮЛ по БИН; запись только через service_role в API';

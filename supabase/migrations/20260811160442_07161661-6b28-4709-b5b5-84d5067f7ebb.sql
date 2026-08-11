CREATE TABLE public.user_dashboard_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_dashboard_prefs_user_tenant_uniq
  ON public.user_dashboard_prefs (user_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_prefs TO authenticated;
GRANT ALL ON public.user_dashboard_prefs TO service_role;

ALTER TABLE public.user_dashboard_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dashboard prefs"
  ON public.user_dashboard_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_dashboard_prefs_updated_at
  BEFORE UPDATE ON public.user_dashboard_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
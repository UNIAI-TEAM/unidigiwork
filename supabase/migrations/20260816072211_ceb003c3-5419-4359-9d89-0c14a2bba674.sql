CREATE TABLE public.user_ui_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('light','dark')),
  tone text NOT NULL DEFAULT 'violet' CHECK (tone IN ('violet','blue','teal','emerald','amber','rose')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ui_prefs TO authenticated;
GRANT ALL ON public.user_ui_prefs TO service_role;
ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ui prefs" ON public.user_ui_prefs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER user_ui_prefs_updated_at BEFORE UPDATE ON public.user_ui_prefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
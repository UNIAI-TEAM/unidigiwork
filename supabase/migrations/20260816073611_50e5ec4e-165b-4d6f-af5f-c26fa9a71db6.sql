ALTER TABLE public.user_ui_prefs
  ADD COLUMN IF NOT EXISTS font_scale text NOT NULL DEFAULT 'md';

ALTER TABLE public.user_ui_prefs
  DROP CONSTRAINT IF EXISTS user_ui_prefs_font_scale_check;

ALTER TABLE public.user_ui_prefs
  ADD CONSTRAINT user_ui_prefs_font_scale_check
  CHECK (font_scale IN ('sm','md','lg','xl'));
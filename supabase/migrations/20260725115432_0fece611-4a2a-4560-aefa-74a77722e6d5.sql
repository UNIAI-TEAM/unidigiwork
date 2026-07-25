CREATE TABLE public.notification_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_mention BOOLEAN NOT NULL DEFAULT true,
  in_app_task BOOLEAN NOT NULL DEFAULT true,
  in_app_meeting BOOLEAN NOT NULL DEFAULT true,
  in_app_document BOOLEAN NOT NULL DEFAULT true,
  in_app_workflow BOOLEAN NOT NULL DEFAULT true,
  in_app_system BOOLEAN NOT NULL DEFAULT true,
  email_mention BOOLEAN NOT NULL DEFAULT true,
  email_task BOOLEAN NOT NULL DEFAULT false,
  email_meeting BOOLEAN NOT NULL DEFAULT true,
  email_document BOOLEAN NOT NULL DEFAULT false,
  email_workflow BOOLEAN NOT NULL DEFAULT false,
  email_system BOOLEAN NOT NULL DEFAULT false,
  email_daily_digest BOOLEAN NOT NULL DEFAULT true,
  email_product_news BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
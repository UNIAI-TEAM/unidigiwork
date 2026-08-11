CREATE OR REPLACE FUNCTION public.tg_usage_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.allow_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'usage_events is append-only (op=%)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;
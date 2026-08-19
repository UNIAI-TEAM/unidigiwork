ALTER TABLE public.user_ui_prefs ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'vi';
DO $$ BEGIN
  ALTER TABLE public.user_ui_prefs ADD CONSTRAINT user_ui_prefs_lang_check CHECK (lang = ANY (ARRAY['vi','en','my','km','lo']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_users integer;
DO $$ BEGIN
  ALTER TABLE public.tenants ADD CONSTRAINT tenants_max_users_chk CHECK (max_users IS NULL OR max_users > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_max_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer;
  cnt integer;
BEGIN
  SELECT max_users INTO lim FROM public.tenants WHERE id = NEW.tenant_id;
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO cnt FROM public.tenant_members
    WHERE tenant_id = NEW.tenant_id AND status IN ('active','invited');
  IF cnt >= lim THEN
    RAISE EXCEPTION 'TENANT_USER_LIMIT_REACHED: tenant % allows at most % accounts', NEW.tenant_id, lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_members_max_users ON public.tenant_members;
CREATE TRIGGER tenant_members_max_users
BEFORE INSERT ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_max_users();
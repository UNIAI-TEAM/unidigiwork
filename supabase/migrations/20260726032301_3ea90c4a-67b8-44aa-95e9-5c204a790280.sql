
-- =========================================================
-- Batch 0B.1: Internal Identity Foundation
-- Additive. Compatibility-preserving. Rollback: DROP tables (safe: new).
-- =========================================================

-- 1) users (internal stable identity)
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY,
  display_name  text,
  primary_email text,
  status        text NOT NULL DEFAULT 'active',
  row_version   bigint NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_status_chk CHECK (status IN ('active','disabled','deleted'))
);

GRANT SELECT ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self_select" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- row_version auto-increment on update
CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER users_bump_row_version
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 2) external_identities
CREATE TABLE IF NOT EXISTS public.external_identities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  provider_subject  text NOT NULL,
  email_snapshot    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_identities_provider_chk
    CHECK (provider IN ('supabase','lovable','keycloak')),
  CONSTRAINT external_identities_unique_provider_subject
    UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS external_identities_user_idx
  ON public.external_identities(user_id);

GRANT SELECT ON public.external_identities TO authenticated;
GRANT ALL ON public.external_identities TO service_role;

ALTER TABLE public.external_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_identities_self_select" ON public.external_identities
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER external_identities_updated_at
  BEFORE UPDATE ON public.external_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Helper: current_internal_user_id (fail-closed)
CREATE OR REPLACE FUNCTION public.current_internal_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_internal_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_internal_user_id() TO authenticated, service_role;

-- 4) Backfill from auth.users
INSERT INTO public.users (id, display_name, primary_email, status, row_version, created_at, updated_at)
SELECT
  au.id,
  COALESCE(p.display_name, split_part(au.email,'@',1)),
  au.email,
  'active',
  1,
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.external_identities (user_id, provider, provider_subject, email_snapshot)
SELECT au.id, 'supabase', au.id::text, au.email
FROM auth.users au
ON CONFLICT (provider, provider_subject) DO NOTHING;

-- 5) Auto-create internal user on new auth signup (compatibility)
CREATE OR REPLACE FUNCTION public.handle_new_internal_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, display_name, primary_email, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)), NEW.email, 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.external_identities (user_id, provider, provider_subject, email_snapshot)
  VALUES (NEW.id, 'supabase', NEW.id::text, NEW.email)
  ON CONFLICT (provider, provider_subject) DO NOTHING;

  RETURN NEW;
END $$;

-- Trigger runs after existing handle_new_user; both on auth.users insert.
DROP TRIGGER IF EXISTS on_auth_user_created_internal ON auth.users;
CREATE TRIGGER on_auth_user_created_internal
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_internal_user();

-- GO-2C Office Bridge: phiên mở tài liệu bằng UniWork Office (desktop).
-- Không đụng tới documents / document_versions (bất biến) và không nới lỏng RLS.

CREATE TABLE IF NOT EXISTS public.office_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  base_version bigint NOT NULL,
  mime_type text,
  file_name text,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED', 'ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  launch_token_hash text NOT NULL UNIQUE,
  session_token_hash text UNIQUE,
  launch_expires_at timestamptz NOT NULL,
  session_expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  last_save_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_sessions_document_idx
  ON public.office_sessions (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS office_sessions_user_idx
  ON public.office_sessions (user_id, created_at DESC);

GRANT SELECT ON public.office_sessions TO authenticated;
GRANT ALL ON public.office_sessions TO service_role;

ALTER TABLE public.office_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS office_sessions_owner_select ON public.office_sessions;
CREATE POLICY office_sessions_owner_select ON public.office_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.office_save_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.office_sessions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  base_version bigint NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PREPARED'
    CHECK (status IN ('PREPARED', 'COMPLETED', 'FAILED', 'CONFLICT')),
  upload_bucket text,
  upload_object_key text,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum_sha256 text,
  result_version bigint,
  result_version_id uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS office_save_operations_document_idx
  ON public.office_save_operations (document_id, created_at DESC);

GRANT SELECT ON public.office_save_operations TO authenticated;
GRANT ALL ON public.office_save_operations TO service_role;

ALTER TABLE public.office_save_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS office_save_operations_owner_select ON public.office_save_operations;
CREATE POLICY office_save_operations_owner_select ON public.office_save_operations
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() AND is_tenant_member(tenant_id));
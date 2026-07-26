
-- =========================================================
-- Batch 0B.5: Audit + Outbox
-- =========================================================

-- 1) audit_events (append-only)
CREATE TABLE IF NOT EXISTS public.audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES public.tenants(id),
  actor_user_id  uuid REFERENCES public.users(id),
  action         text NOT NULL,
  resource_type  text NOT NULL,
  resource_id    text,
  before_state   jsonb,
  after_state    jsonb,
  correlation_id uuid,
  source         text NOT NULL DEFAULT 'app',
  ip_address     inet,
  user_agent     text,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_tenant_time_idx
  ON public.audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx
  ON public.audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_events_correlation_idx
  ON public.audit_events(correlation_id);

-- Browser can only SELECT audit for own tenants; INSERT via trusted function; no UPDATE/DELETE
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_events_tenant_select" ON public.audit_events
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id));

-- Prevent UPDATE/DELETE for everyone except service_role (no policy for UPDATE/DELETE → denied for authenticated)
-- Also enforce append-only at trigger level as defense-in-depth:
CREATE OR REPLACE FUNCTION public.tg_audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (op=%)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS audit_events_no_update ON public.audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_events_immutable();

-- 2) outbox_events
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid REFERENCES public.tenants(id),
  event_type         text NOT NULL,
  aggregate_type     text NOT NULL,
  aggregate_id       text NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid,
  idempotency_key    text NOT NULL,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  available_at       timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz,
  attempt_count      int NOT NULL DEFAULT 0,
  last_error         text,
  status             text NOT NULL DEFAULT 'pending',
  lease_owner        text,
  lease_expires_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_status_chk
    CHECK (status IN ('pending','processing','processed','retry','dead_letter')),
  CONSTRAINT outbox_idempotency_unique UNIQUE (event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS outbox_status_available_idx
  ON public.outbox_events(status, available_at)
  WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS outbox_lease_idx
  ON public.outbox_events(lease_expires_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS outbox_tenant_idx ON public.outbox_events(tenant_id);

-- Browser MUST NOT access outbox_events at all
GRANT ALL ON public.outbox_events TO service_role;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated → denied.

-- 3) Trusted operations
CREATE OR REPLACE FUNCTION public.claim_outbox_events(
  _worker text,
  _batch int DEFAULT 10,
  _lease_seconds int DEFAULT 60
) RETURNS SETOF public.outbox_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.outbox_events oe
  SET status = 'processing',
      lease_owner = _worker,
      lease_expires_at = now() + make_interval(secs => _lease_seconds),
      attempt_count = oe.attempt_count + 1
  WHERE oe.id IN (
    SELECT id FROM public.outbox_events
    WHERE (
      (status IN ('pending','retry') AND available_at <= now())
      OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
    )
    ORDER BY available_at
    LIMIT _batch
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END $$;

REVOKE ALL ON FUNCTION public.claim_outbox_events(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_outbox_events(text,int,int) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_outbox_event(_id uuid, _worker text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _rows int;
BEGIN
  UPDATE public.outbox_events
  SET status = 'processed',
      processed_at = now(),
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error = NULL
  WHERE id = _id AND lease_owner = _worker AND status = 'processing';
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END $$;

REVOKE ALL ON FUNCTION public.complete_outbox_event(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_outbox_event(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(
  _id uuid, _worker text, _error text, _retry_after_seconds int DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _rows int; _attempts int;
BEGIN
  SELECT attempt_count INTO _attempts FROM public.outbox_events WHERE id = _id;
  IF _attempts IS NULL THEN RETURN false; END IF;

  UPDATE public.outbox_events
  SET status = CASE WHEN _attempts >= 10 THEN 'dead_letter' ELSE 'retry' END,
      available_at = now() + make_interval(secs => _retry_after_seconds),
      last_error = _error,
      lease_owner = NULL,
      lease_expires_at = NULL
  WHERE id = _id AND lease_owner = _worker AND status = 'processing';
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END $$;

REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid,text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_outbox_event(uuid,text,text,int) TO service_role;

CREATE OR REPLACE FUNCTION public.extend_outbox_lease(_id uuid, _worker text, _seconds int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _rows int;
BEGIN
  UPDATE public.outbox_events
  SET lease_expires_at = now() + make_interval(secs => _seconds)
  WHERE id = _id AND lease_owner = _worker AND status = 'processing';
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END $$;

REVOKE ALL ON FUNCTION public.extend_outbox_lease(uuid,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_outbox_lease(uuid,text,int) TO service_role;

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  event_types text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  last_status integer,
  last_error text,
  last_delivered_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant admins manage webhook endpoints"
ON public.webhook_endpoints FOR ALL TO authenticated
USING (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON public.webhook_endpoints(tenant_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.outbox_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.outbox_events(id) ON DELETE CASCADE,
  tenant_id uuid,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','push','webhook','noop')),
  target text,
  status text NOT NULL CHECK (status IN ('sent','skipped','failed')),
  http_status integer,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.outbox_deliveries TO authenticated;
GRANT ALL ON public.outbox_deliveries TO service_role;
ALTER TABLE public.outbox_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant admins read outbox deliveries"
ON public.outbox_deliveries FOR SELECT TO authenticated
USING (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_outbox_deliveries_event ON public.outbox_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_outbox_deliveries_created ON public.outbox_deliveries(created_at DESC);
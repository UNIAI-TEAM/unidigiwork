ALTER TABLE public.audit_events ALTER COLUMN correlation_id TYPE TEXT USING correlation_id::text;
ALTER TABLE public.outbox_events ALTER COLUMN correlation_id TYPE TEXT USING correlation_id::text;
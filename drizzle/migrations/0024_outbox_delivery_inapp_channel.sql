ALTER TABLE public.outbox_deliveries DROP CONSTRAINT IF EXISTS outbox_deliveries_channel_check;
ALTER TABLE public.outbox_deliveries ADD CONSTRAINT outbox_deliveries_channel_check
  CHECK (channel = ANY (ARRAY['email'::text,'push'::text,'webhook'::text,'noop'::text,'graph'::text,'inapp'::text]));
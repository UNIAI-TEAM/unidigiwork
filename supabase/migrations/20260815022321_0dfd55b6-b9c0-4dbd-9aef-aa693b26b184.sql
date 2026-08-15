ALTER TABLE public.email_states REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_states') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_states;
  END IF;
END $$;
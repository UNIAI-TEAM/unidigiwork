INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable, system_creatable) VALUES
  ('DISCUSSED_IN', 'COMMITMENT', 'CHAT_CHANNEL', true, true)
ON CONFLICT DO NOTHING;
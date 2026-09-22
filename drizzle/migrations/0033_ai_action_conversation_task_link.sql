ALTER TABLE public.ai_action_proposals
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_action_proposals_conversation_idx
  ON public.ai_action_proposals (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;
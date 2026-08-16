CREATE TABLE public.ai_action_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid,
  action_type text NOT NULL,
  risk text NOT NULL DEFAULT 'LOW',
  source text NOT NULL DEFAULT 'UNI_COPILOT',
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_type text,
  target_id uuid,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PROPOSED',
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  expected_row_version integer,
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  confirmed_at timestamptz,
  executed_at timestamptz,
  CONSTRAINT ai_action_proposals_status_chk CHECK (status IN ('PROPOSED','PREVIEWED','CONFIRMED','EXECUTING','SUCCEEDED','FAILED','EXPIRED','CANCELLED')),
  CONSTRAINT ai_action_proposals_type_chk CHECK (action_type IN ('CREATE_TASK','UPDATE_TASK_FIELDS','CREATE_MEETING','CREATE_EMAIL_DRAFT')),
  CONSTRAINT ai_action_proposals_risk_chk CHECK (risk IN ('LOW','MEDIUM','HIGH','PROHIBITED')),
  CONSTRAINT ai_action_proposals_source_chk CHECK (source IN ('UNI_COPILOT','MEETING_INTELLIGENCE','EMAIL_INTELLIGENCE','PROJECT_CONTEXT'))
);

CREATE INDEX ai_action_proposals_user_idx ON public.ai_action_proposals (user_id, created_at DESC);
CREATE INDEX ai_action_proposals_tenant_idx ON public.ai_action_proposals (tenant_id, status);
CREATE UNIQUE INDEX ai_action_proposals_idem_idx ON public.ai_action_proposals (user_id, idempotency_key);

GRANT SELECT, INSERT, UPDATE ON public.ai_action_proposals TO authenticated;
GRANT ALL ON public.ai_action_proposals TO service_role;

ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own proposals select" ON public.ai_action_proposals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own proposals insert" ON public.ai_action_proposals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own proposals update" ON public.ai_action_proposals
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER ai_action_proposals_updated_at
  BEFORE UPDATE ON public.ai_action_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
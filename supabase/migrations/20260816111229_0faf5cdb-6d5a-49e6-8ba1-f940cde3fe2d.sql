CREATE TABLE public.workflow_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text,
  trigger_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_type text NOT NULL,
  instruction text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  row_version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_agents_trigger_chk CHECK (trigger_type IN ('TASK_OVERDUE','TASK_UNASSIGNED','TASK_HIGH_PRIORITY','MEETING_ENDED','MANUAL')),
  CONSTRAINT workflow_agents_action_chk CHECK (action_type IN ('CREATE_TASK','UPDATE_TASK_FIELDS','CREATE_MEETING','CREATE_EMAIL_DRAFT')),
  CONSTRAINT workflow_agents_approval_chk CHECK (requires_approval IS TRUE)
);
CREATE INDEX workflow_agents_ws_idx ON public.workflow_agents(workspace_id, enabled);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_agents TO authenticated;
GRANT ALL ON public.workflow_agents TO service_role;
ALTER TABLE public.workflow_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_agents_select ON public.workflow_agents FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY workflow_agents_write ON public.workflow_agents FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id) AND EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = workflow_agents.workspace_id AND w.tenant_id = workflow_agents.tenant_id
  ));

CREATE TABLE public.workflow_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.workflow_agents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'EVALUATED',
  matched_count integer NOT NULL DEFAULT 0,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal_id uuid REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_agent_runs_status_chk CHECK (status IN ('EVALUATED','NO_MATCH','PROPOSED','APPROVED','REJECTED','FAILED'))
);
CREATE INDEX workflow_agent_runs_agent_idx ON public.workflow_agent_runs(agent_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.workflow_agent_runs TO authenticated;
GRANT ALL ON public.workflow_agent_runs TO service_role;
ALTER TABLE public.workflow_agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_agent_runs_select ON public.workflow_agent_runs FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
CREATE POLICY workflow_agent_runs_write ON public.workflow_agent_runs FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));

CREATE TRIGGER workflow_agents_updated_at BEFORE UPDATE ON public.workflow_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_action_proposals DROP CONSTRAINT IF EXISTS ai_action_proposals_source_chk;
ALTER TABLE public.ai_action_proposals ADD CONSTRAINT ai_action_proposals_source_chk
  CHECK (source IN ('UNI_COPILOT','MEETING_INTELLIGENCE','EMAIL_INTELLIGENCE','PROJECT_CONTEXT','WORKFLOW_AGENT'));
CREATE TABLE public.ai_agent_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.workflow_agents(id) ON DELETE CASCADE,
  market_agent_id uuid REFERENCES public.ai_market_agents(id) ON DELETE SET NULL,
  proposals_sent integer NOT NULL DEFAULT 0,
  proposals_approved integer NOT NULL DEFAULT 0,
  tasks_completed integer NOT NULL DEFAULT 0,
  runs_total integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_id)
);

GRANT SELECT ON public.ai_agent_performance TO authenticated;
GRANT ALL ON public.ai_agent_performance TO service_role;
ALTER TABLE public.ai_agent_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agent_performance_select" ON public.ai_agent_performance
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- Recompute counters for one agent from source-of-truth tables.
CREATE OR REPLACE FUNCTION public.recompute_ai_agent_performance(_tenant_id uuid, _agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runs int; v_completed int; v_proposals int; v_approved int; v_last timestamptz; v_market uuid;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE upper(r.status) IN ('SUCCEEDED','APPROVED')),
         count(*) FILTER (WHERE r.proposal_id IS NOT NULL),
         count(*) FILTER (WHERE p.id IS NOT NULL AND upper(p.status) IN ('CONFIRMED','EXECUTED','SUCCEEDED')),
         max(r.created_at)
    INTO v_runs, v_completed, v_proposals, v_approved, v_last
  FROM public.workflow_agent_runs r
  LEFT JOIN public.ai_action_proposals p ON p.id = r.proposal_id
  WHERE r.tenant_id = _tenant_id AND r.agent_id = _agent_id;

  SELECT e.market_agent_id INTO v_market
  FROM public.ai_employments e
  WHERE e.tenant_id = _tenant_id AND e.workflow_agent_id = _agent_id
  ORDER BY e.created_at DESC LIMIT 1;

  INSERT INTO public.ai_agent_performance AS t
    (tenant_id, agent_id, market_agent_id, proposals_sent, proposals_approved, tasks_completed, runs_total, last_run_at, updated_at)
  VALUES (_tenant_id, _agent_id, v_market, coalesce(v_proposals,0), coalesce(v_approved,0), coalesce(v_completed,0), coalesce(v_runs,0), v_last, now())
  ON CONFLICT (tenant_id, agent_id) DO UPDATE SET
    market_agent_id = coalesce(EXCLUDED.market_agent_id, t.market_agent_id),
    proposals_sent = EXCLUDED.proposals_sent,
    proposals_approved = EXCLUDED.proposals_approved,
    tasks_completed = EXCLUDED.tasks_completed,
    runs_total = EXCLUDED.runs_total,
    last_run_at = EXCLUDED.last_run_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ai_agent_perf_from_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_ai_agent_performance(COALESCE(NEW.tenant_id, OLD.tenant_id), COALESCE(NEW.agent_id, OLD.agent_id));
  RETURN NULL;
END;
$$;

CREATE TRIGGER ai_agent_perf_run_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.workflow_agent_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_ai_agent_perf_from_run();

CREATE OR REPLACE FUNCTION public.tg_ai_agent_perf_from_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  FOR r IN SELECT DISTINCT tenant_id, agent_id FROM public.workflow_agent_runs WHERE proposal_id = NEW.id LOOP
    PERFORM public.recompute_ai_agent_performance(r.tenant_id, r.agent_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ai_agent_perf_proposal_au
AFTER UPDATE ON public.ai_action_proposals
FOR EACH ROW EXECUTE FUNCTION public.tg_ai_agent_perf_from_proposal();

-- Backfill existing agents
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id, agent_id FROM public.workflow_agent_runs LOOP
    PERFORM public.recompute_ai_agent_performance(r.tenant_id, r.agent_id);
  END LOOP;
  FOR r IN SELECT DISTINCT tenant_id, workflow_agent_id AS agent_id FROM public.ai_employments WHERE workflow_agent_id IS NOT NULL LOOP
    PERFORM public.recompute_ai_agent_performance(r.tenant_id, r.agent_id);
  END LOOP;
END $$;
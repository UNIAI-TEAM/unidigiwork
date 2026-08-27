-- WEE-2: governance columns for AI workers and action proposals.
ALTER TABLE public.ai_workers
  ADD COLUMN IF NOT EXISTS scope_workspace_ids uuid[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scope_project_ids uuid[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scope_object_types text[] NOT NULL DEFAULT ARRAY['TASK']::text[],
  ADD COLUMN IF NOT EXISTS autonomy_policy jsonb NOT NULL DEFAULT
    '{"LOW":"PREPARE","MEDIUM":"EXECUTE_WITH_APPROVAL","HIGH":"EXECUTE_WITH_APPROVAL","CRITICAL":"DENY"}'::jsonb;

ALTER TABLE public.ai_action_proposals
  ADD COLUMN IF NOT EXISTS ai_worker_id uuid REFERENCES public.ai_workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_id uuid REFERENCES public.ai_task_executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS governance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ai_action_proposals_execution_idx
  ON public.ai_action_proposals(execution_id) WHERE execution_id IS NOT NULL;

-- Golden worker: AI Project Analyst được cấp đúng một tool ghi.
UPDATE public.ai_workers
   SET allowed_tools = ARRAY['AI_CONTEXT_ENGINE','CREATE_TASK']::text[],
       scope_object_types = ARRAY['TASK']::text[]
 WHERE code = 'PROJECT_ANALYST'
   AND NOT ('CREATE_TASK' = ANY(allowed_tools));
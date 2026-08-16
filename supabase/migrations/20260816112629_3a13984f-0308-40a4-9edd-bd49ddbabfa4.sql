ALTER TABLE public.workflow_agents
  ADD COLUMN IF NOT EXISTS allowed_action_types text[] NOT NULL DEFAULT ARRAY['CREATE_TASK','UPDATE_TASK_FIELDS','CREATE_MEETING','CREATE_EMAIL_DRAFT']::text[],
  ADD COLUMN IF NOT EXISTS allowed_sources text[] NOT NULL DEFAULT ARRAY['WORKFLOW_AGENT']::text[];

ALTER TABLE public.workflow_agents
  DROP CONSTRAINT IF EXISTS workflow_agents_allowed_action_types_check;
ALTER TABLE public.workflow_agents
  ADD CONSTRAINT workflow_agents_allowed_action_types_check
  CHECK (allowed_action_types <@ ARRAY['CREATE_TASK','UPDATE_TASK_FIELDS','CREATE_MEETING','CREATE_EMAIL_DRAFT']::text[]);

ALTER TABLE public.workflow_agents
  DROP CONSTRAINT IF EXISTS workflow_agents_allowed_sources_check;
ALTER TABLE public.workflow_agents
  ADD CONSTRAINT workflow_agents_allowed_sources_check
  CHECK (allowed_sources <@ ARRAY['UNI_COPILOT','MEETING_INTELLIGENCE','EMAIL_INTELLIGENCE','PROJECT_CONTEXT','WORKFLOW_AGENT']::text[]);

UPDATE public.workflow_agents
SET allowed_action_types = ARRAY[action_type]::text[]
WHERE allowed_action_types IS NULL;
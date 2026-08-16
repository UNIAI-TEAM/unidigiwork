-- Backfill: chuyển allowlist cũ sang danh mục kỹ năng, giữ nguyên hành động + nguồn
WITH legacy AS (
  SELECT id, action_type, coalesce(allowed_action_types, '{}') AS acts, coalesce(allowed_sources, '{}') AS srcs
  FROM public.workflow_agents
  WHERE skills IS NULL OR cardinality(skills) = 0
), mapped AS (
  SELECT l.id,
    ARRAY(SELECT DISTINCT s FROM unnest(
      (CASE WHEN 'CREATE_TASK' = ANY(l.acts) OR l.action_type = 'CREATE_TASK' THEN ARRAY['PROPOSE_TASK'] ELSE '{}' END)
      || (CASE WHEN 'UPDATE_TASK_FIELDS' = ANY(l.acts) OR l.action_type = 'UPDATE_TASK_FIELDS' THEN ARRAY['PROPOSE_TASK_UPDATE','WORKLOAD_TRIAGE'] ELSE '{}' END)
      || (CASE WHEN 'CREATE_MEETING' = ANY(l.acts) OR l.action_type = 'CREATE_MEETING' THEN ARRAY['PROPOSE_MEETING'] ELSE '{}' END)
      || (CASE WHEN 'CREATE_EMAIL_DRAFT' = ANY(l.acts) OR l.action_type = 'CREATE_EMAIL_DRAFT' THEN
            (CASE WHEN 'MEETING_INTELLIGENCE' = ANY(l.srcs) THEN ARRAY['DRAFT_EMAIL','DRAFT_FOLLOW_UP'] ELSE ARRAY['DRAFT_EMAIL'] END)
          ELSE '{}' END)
      || (CASE WHEN 'MEETING_INTELLIGENCE' = ANY(l.srcs) THEN ARRAY['MEETING_RECALL'] ELSE '{}' END)
      || (CASE WHEN 'PROJECT_CONTEXT' = ANY(l.srcs) THEN ARRAY['SUMMARIZE_WORK'] ELSE '{}' END)
    ) AS s) AS skills
  FROM legacy l
)
UPDATE public.workflow_agents a
SET skills = m.skills,
    updated_at = now()
FROM mapped m
WHERE a.id = m.id AND cardinality(m.skills) > 0;
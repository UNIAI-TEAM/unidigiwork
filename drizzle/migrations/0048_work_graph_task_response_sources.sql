CREATE OR REPLACE FUNCTION public.list_work_graph_task_response_sources(
  _tenant_id uuid,
  _task_ids uuid[]
) RETURNS TABLE (
  task_id uuid,
  team_response_count integer,
  team_last_response_at timestamptz,
  ai_response_count integer,
  ai_last_response_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT DISTINCT unnest(COALESCE(_task_ids, ARRAY[]::uuid[])) AS task_id
  ),
  visible_tasks AS (
    SELECT t.id
    FROM requested r
    JOIN public.tasks t ON t.id = r.task_id
    WHERE t.tenant_id = _tenant_id
      AND t.deleted_at IS NULL
      AND public.is_tenant_member(t.tenant_id)
  ),
  team_stats AS (
    SELECT tc.task_id,
      count(*)::integer AS response_count,
      max(tc.created_at) AS last_response_at
    FROM public.task_comments tc
    JOIN visible_tasks vt ON vt.id = tc.task_id
    WHERE tc.tenant_id = _tenant_id
      AND tc.deleted_at IS NULL
    GROUP BY tc.task_id
  ),
  linked_conversations AS (
    SELECT DISTINCT vt.id AS task_id, lm.conversation_id
    FROM visible_tasks vt
    JOIN public.ai_messages lm ON lm.tenant_id = _tenant_id
      AND (
        lm.metadata @> jsonb_build_object('contextEntities', jsonb_build_array(jsonb_build_object('type','TASK','id',vt.id::text)))
        OR lm.metadata @> jsonb_build_object('sources', jsonb_build_array(jsonb_build_object('entityType','TASK','entityId',vt.id::text)))
      )
    UNION
    SELECT DISTINCT vt.id, ap.conversation_id
    FROM visible_tasks vt
    JOIN public.ai_action_proposals ap ON ap.tenant_id = _tenant_id
      AND ap.conversation_id IS NOT NULL
      AND ap.status = 'SUCCEEDED'
      AND ap.action_type = 'CREATE_TASK'
      AND ap.result @> jsonb_build_object('entityType','TASK','entityId',vt.id::text)
  ),
  ai_stats AS (
    SELECT lc.task_id,
      count(*)::integer AS response_count,
      max(am.created_at) AS last_response_at
    FROM linked_conversations lc
    JOIN public.ai_messages am ON am.conversation_id = lc.conversation_id
      AND am.tenant_id = _tenant_id
      AND am.role = 'assistant'
    GROUP BY lc.task_id
  )
  SELECT vt.id,
    COALESCE(ts.response_count, 0), ts.last_response_at,
    COALESCE(ais.response_count, 0), ais.last_response_at
  FROM visible_tasks vt
  LEFT JOIN team_stats ts ON ts.task_id = vt.id
  LEFT JOIN ai_stats ais ON ais.task_id = vt.id;
$$;
REVOKE ALL ON FUNCTION public.list_work_graph_task_response_sources(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_work_graph_task_response_sources(uuid,uuid[]) TO authenticated, service_role;
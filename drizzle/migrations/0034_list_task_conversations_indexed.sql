CREATE INDEX IF NOT EXISTS ai_messages_task_metadata_gin_idx
  ON public.ai_messages USING gin (metadata jsonb_path_ops)
  WHERE metadata IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_action_proposals_result_gin_idx
  ON public.ai_action_proposals USING gin (result jsonb_path_ops)
  WHERE result IS NOT NULL;

CREATE OR REPLACE FUNCTION public.list_task_conversation_ids(
  _task_id uuid,
  _limit integer DEFAULT 20
)
RETURNS TABLE(conversation_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH visible_task AS (
    SELECT t.id, t.tenant_id
    FROM public.tasks t
    WHERE t.id = _task_id
      AND t.deleted_at IS NULL
  ), linked AS (
    SELECT m.conversation_id, max(m.created_at) AS linked_at
    FROM public.ai_messages m
    JOIN visible_task t ON t.tenant_id = m.tenant_id
    WHERE m.metadata @> jsonb_build_object(
      'contextEntities', jsonb_build_array(jsonb_build_object('type', 'TASK', 'id', _task_id::text))
    )
    OR m.metadata @> jsonb_build_object(
      'sources', jsonb_build_array(jsonb_build_object('entityType', 'TASK', 'entityId', _task_id::text))
    )
    GROUP BY m.conversation_id

    UNION ALL

    SELECT p.conversation_id, max(p.created_at) AS linked_at
    FROM public.ai_action_proposals p
    JOIN visible_task t ON t.tenant_id = p.tenant_id
    WHERE p.conversation_id IS NOT NULL
      AND p.status = 'SUCCEEDED'
      AND p.action_type = 'CREATE_TASK'
      AND p.result @> jsonb_build_object('entityType', 'TASK', 'entityId', _task_id::text)
    GROUP BY p.conversation_id
  )
  SELECT linked.conversation_id
  FROM linked
  JOIN public.ai_conversations c ON c.id = linked.conversation_id
  WHERE c.deleted_at IS NULL
  GROUP BY linked.conversation_id, c.last_message_at
  ORDER BY max(linked.linked_at) DESC, c.last_message_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 20), 50));
$$;

GRANT EXECUTE ON FUNCTION public.list_task_conversation_ids(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_task_conversation_ids(uuid, integer) TO service_role;
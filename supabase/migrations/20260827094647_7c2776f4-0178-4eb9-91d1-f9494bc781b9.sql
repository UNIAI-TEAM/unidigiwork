CREATE OR REPLACE FUNCTION public.get_ai_task_brief(_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _t public.tasks; _w public.ai_workers;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _t FROM public.tasks WHERE id=_task_id AND deleted_at IS NULL;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_t.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_t.workspace_id AND m.user_id=_actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _t.ai_worker_id IS NOT NULL THEN
    SELECT * INTO _w FROM public.ai_workers WHERE id=_t.ai_worker_id;
  END IF;
  RETURN jsonb_build_object(
    'task_id', _t.id,
    'tenant_id', _t.tenant_id,
    'workspace_id', _t.workspace_id,
    'project_id', _t.project_id,
    'priority', _t.priority,
    'title', _t.title,
    'description', _t.description,
    'expected_deliverable', _t.expected_deliverable,
    'acceptance_criteria', _t.acceptance_criteria,
    'execution_mode', _t.execution_mode,
    'ai_execution_status', _t.ai_execution_status,
    'worker', CASE WHEN _w.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _w.id, 'tenant_id', _w.tenant_id, 'name', _w.name, 'role', _w.role,
      'skills', to_jsonb(_w.skills),
      'allowed_tools', to_jsonb(_w.allowed_tools),
      'permission_scope', _w.permission_scope,
      'scope_workspace_ids', to_jsonb(_w.scope_workspace_ids),
      'scope_project_ids', to_jsonb(_w.scope_project_ids),
      'scope_object_types', to_jsonb(_w.scope_object_types),
      'autonomy_policy', _w.autonomy_policy,
      'status', _w.status) END
  );
END $function$;
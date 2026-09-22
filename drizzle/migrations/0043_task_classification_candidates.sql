CREATE OR REPLACE FUNCTION public.list_task_classification_candidates(_task_id uuid, _limit integer DEFAULT 20) RETURNS TABLE(id uuid,title text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _task public.tasks;
BEGIN
 SELECT * INTO _task FROM public.tasks WHERE tasks.id=_task_id AND deleted_at IS NULL;
 IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT t.id,t.title FROM public.tasks t WHERE t.tenant_id=_task.tenant_id AND t.deleted_at IS NULL ORDER BY (t.id=_task_id) DESC,t.updated_at DESC LIMIT greatest(1,least(coalesce(_limit,20),50));
END $$;
REVOKE ALL ON FUNCTION public.list_task_classification_candidates(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_task_classification_candidates(uuid,integer) TO authenticated, service_role;
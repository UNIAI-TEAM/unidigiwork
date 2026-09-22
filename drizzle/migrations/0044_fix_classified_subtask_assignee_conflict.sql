CREATE OR REPLACE FUNCTION public.apply_task_message_classification(_comment_id uuid,_label text,_confidence numeric,_task_title text,_related_task_id uuid,_model text,_classifier_version text,_idempotency_key text,_correlation_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _actor uuid:=auth.uid(); _comment public.task_comments; _parent public.tasks; _related public.tasks; _created public.tasks; _label_norm text:=upper(_label); _result jsonb;
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
 IF _label_norm NOT IN ('TASK','FEEDBACK','RELATED_WORK','OTHER','FAILED') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION' USING ERRCODE='22023'; END IF;
 SELECT * INTO _comment FROM public.task_comments WHERE id=_comment_id AND deleted_at IS NULL FOR UPDATE;
 IF _comment.id IS NULL THEN RAISE EXCEPTION 'TASK_COMMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO _parent FROM public.tasks WHERE id=_comment.task_id AND deleted_at IS NULL;
 IF _parent.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF NOT public.is_tenant_member(_parent.tenant_id) OR _comment.author_id<>_actor THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF coalesce(_comment.metadata->'classification'->>'status','')='APPLIED' THEN RETURN _comment.metadata->'classification'; END IF;
 IF _label_norm='TASK' AND nullif(btrim(_task_title),'') IS NOT NULL THEN
   _created:=public.create_subtask(_parent.id,left(btrim(_task_title),500),'normal'::public.task_priority,NULL,_idempotency_key||':task',_correlation_id);
   INSERT INTO public.task_assignees(task_id,tenant_id,user_id,role,assigned_by) SELECT _created.id,_parent.tenant_id,ta.user_id,ta.role,_actor FROM public.task_assignees ta WHERE ta.task_id=_parent.id ON CONFLICT DO NOTHING;
 ELSIF _label_norm='RELATED_WORK' AND _related_task_id IS NOT NULL THEN
   SELECT * INTO _related FROM public.tasks WHERE id=_related_task_id AND deleted_at IS NULL AND tenant_id=_parent.tenant_id;
   IF _related.id IS NOT NULL AND _related.id<>_parent.id THEN PERFORM public._work_graph_link_system_in_tenant(_parent.tenant_id,'TASK',_parent.id,'TASK',_related.id,'RELATED_TO',jsonb_build_object('source_comment_id',_comment.id,'classification','AI')); END IF;
 END IF;
 _result:=jsonb_build_object('label',_label_norm,'status',CASE WHEN _label_norm='FAILED' THEN 'FAILED' ELSE 'APPLIED' END,'confidence',greatest(0,least(1,coalesce(_confidence,0))),'task_title',nullif(btrim(_task_title),''),'created_task_id',_created.id,'related_task_id',CASE WHEN _related.id IS NOT NULL THEN _related.id ELSE NULL END,'model',_model,'version',_classifier_version,'classified_at',now());
 UPDATE public.task_comments SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('classification',_result) WHERE id=_comment.id;
 PERFORM public._emit_outbox_event(_parent.tenant_id,'task.comment.classified','task_comment',_comment.id::text,_result||jsonb_build_object('task_id',_parent.id,'comment_id',_comment.id),_idempotency_key,_correlation_id);
 RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.apply_task_message_classification(uuid,text,numeric,text,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_task_message_classification(uuid,text,numeric,text,uuid,text,text,text,text) TO authenticated, service_role;
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS task_comments_classification_idx ON public.task_comments (task_id, ((metadata->'classification'->>'label')), created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.can_send_work_graph_message(_task_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.tasks t JOIN public.tenant_members tm ON tm.tenant_id=t.tenant_id AND tm.user_id=auth.uid() AND tm.status='active' WHERE t.id=_task_id AND t.deleted_at IS NULL AND tm.role IN ('tenant_owner','tenant_admin','manager'));
$$;
REVOKE ALL ON FUNCTION public.can_send_work_graph_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_work_graph_message(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.comment_task_to_assignee(_task_id uuid,_recipient_id uuid,_body text,_idempotency_key text,_correlation_id text,_source text) RETURNS public.task_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _actor uuid:=auth.uid(); _task public.tasks; _comment public.task_comments; _existing uuid; _src text:=upper(coalesce(_source,'TASK_CHAT'));
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
 IF _src NOT IN ('TASK_CHAT','WORK_GRAPH') THEN RAISE EXCEPTION 'INVALID_MESSAGE_SOURCE' USING ERRCODE='22023'; END IF;
 SELECT * INTO _task FROM public.tasks WHERE id=_task_id AND deleted_at IS NULL;
 IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF _src='WORK_GRAPH' AND NOT public.can_send_work_graph_message(_task_id) THEN RAISE EXCEPTION 'WORK_GRAPH_MESSAGE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id=_task_id AND ta.tenant_id=_task.tenant_id AND ta.user_id=_recipient_id) THEN RAISE EXCEPTION 'RECIPIENT_NOT_TASK_ASSIGNEE' USING ERRCODE='42501'; END IF;
 SELECT nullif(payload->>'comment_id','')::uuid INTO _existing FROM public.outbox_events WHERE event_type='task.task.message_sent' AND idempotency_key=_idempotency_key LIMIT 1;
 IF _existing IS NOT NULL THEN SELECT * INTO _comment FROM public.task_comments WHERE id=_existing AND deleted_at IS NULL; IF _comment.id IS NOT NULL THEN RETURN _comment; END IF; END IF;
 INSERT INTO public.task_comments(task_id,author_id,body,metadata) VALUES (_task_id,_actor,_body,jsonb_build_object('source',_src,'classification',jsonb_build_object('status','PENDING'))) RETURNING * INTO _comment;
 PERFORM public._emit_outbox_event(_task.tenant_id,'task.task.message_sent','task',_task.id::text,jsonb_build_object('task_id',_task.id,'comment_id',_comment.id,'author_id',_actor,'recipient_user_ids',jsonb_build_array(_recipient_id::text),'title','Tin nhắn mới trong công việc','body',left(_body,500),'href','/m/tasks/'||_task.id::text,'source',_src),_idempotency_key,_correlation_id);
 RETURN _comment;
END $$;
REVOKE ALL ON FUNCTION public.comment_task_to_assignee(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comment_task_to_assignee(uuid,uuid,text,text,text,text) TO authenticated, service_role;

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
   INSERT INTO public.task_assignees(task_id,tenant_id,user_id,role,assigned_by) SELECT _created.id,_parent.tenant_id,ta.user_id,ta.role,_actor FROM public.task_assignees ta WHERE ta.task_id=_parent.id ON CONFLICT (task_id,user_id) DO NOTHING;
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
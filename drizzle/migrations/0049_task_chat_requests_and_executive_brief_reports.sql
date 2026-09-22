CREATE OR REPLACE FUNCTION public.apply_task_message_classification_v2(
  _comment_id uuid,
  _label text,
  _confidence numeric,
  _task_title text,
  _related_task_id uuid,
  _suggested_due_at timestamptz,
  _model text,
  _classifier_version text,
  _idempotency_key text,
  _correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _comment public.task_comments;
  _parent public.tasks;
  _related public.tasks;
  _created public.tasks;
  _work_product public.work_products;
  _label_norm text := upper(_label);
  _due_at timestamptz;
  _recipient_id uuid;
  _result jsonb;
  _report_content text;
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

  IF _label_norm='TASK' THEN
    IF nullif(btrim(_task_title),'') IS NULL THEN RAISE EXCEPTION 'TASK_TITLE_REQUIRED' USING ERRCODE='22023'; END IF;
    _due_at := CASE
      WHEN _suggested_due_at IS NOT NULL AND _suggested_due_at > now() THEN _suggested_due_at
      ELSE now() + interval '3 days'
    END;
    _created := public.create_subtask(
      _parent.id,
      left(btrim(_task_title),500),
      'normal'::public.task_priority,
      _due_at,
      _idempotency_key||':task',
      _correlation_id
    );
    INSERT INTO public.task_assignees(task_id,tenant_id,user_id,role,assigned_by)
      SELECT _created.id,_parent.tenant_id,ta.user_id,ta.role,_actor
      FROM public.task_assignees ta WHERE ta.task_id=_parent.id
      ON CONFLICT DO NOTHING;

    BEGIN
      _recipient_id := nullif(_comment.metadata->>'recipient_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      _recipient_id := NULL;
    END;
    IF _recipient_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id=_parent.tenant_id AND tm.user_id=_recipient_id AND tm.status='active'
    ) THEN
      _recipient_id := _actor;
    END IF;

    _report_content := concat(
      '# ', left(btrim(_task_title),500), E'\n\n',
      '## Yêu cầu', E'\n', _comment.body, E'\n\n',
      '## Hạn hoàn thành', E'\n', to_char(_due_at AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI'), E'\n\n',
      '## Trạng thái', E'\n', 'Bản nháp đang chờ người phụ trách thực hiện và cập nhật.'
    );

    INSERT INTO public.work_products(
      tenant_id,workspace_id,title,description,business_type,status,content,
      owner_id,created_by,ai_generated,current_version,primary_context_type,primary_context_id,tags
    ) VALUES (
      _parent.tenant_id,_parent.workspace_id,left(btrim(_task_title),300),left(_comment.body,2000),
      'REPORT','DRAFT',_report_content,_recipient_id,_actor,true,1,'TASK',_created.id,
      ARRAY['TASK_CHAT_REQUEST','AUTO_REPORT']::text[]
    ) RETURNING * INTO _work_product;

    INSERT INTO public.work_product_versions(
      tenant_id,work_product_id,version,title,content,summary,provenance,ai_generated,author_id
    ) VALUES (
      _parent.tenant_id,_work_product.id,1,_work_product.title,_report_content,
      'Báo cáo được tạo tự động từ yêu cầu mới trong Tổng hợp chat.',
      jsonb_build_array(jsonb_build_object(
        'entityType','TASK_COMMENT','entityId',_comment.id,'taskId',_parent.id,
        'childTaskId',_created.id,'capturedAt',now()
      )),true,_actor
    );

    PERFORM public._touch_work_product_graph_node(_work_product.id,1);
    PERFORM public._work_graph_link_system_in_tenant(
      _parent.tenant_id,'TASK',_created.id,'WORK_PRODUCT',_work_product.id,'PRODUCES',
      jsonb_build_object('source','TASK_CHAT_REQUEST','source_comment_id',_comment.id)
    );
    PERFORM public._work_graph_link_system_in_tenant(
      _parent.tenant_id,'WORK_PRODUCT',_work_product.id,'TASK',_parent.id,'REFERENCES',
      jsonb_build_object('source','TASK_CHAT_REQUEST','source_comment_id',_comment.id)
    );
    PERFORM public._emit_outbox_event(
      _parent.tenant_id,'work_product.created_from_task_chat','work_product',_work_product.id::text,
      jsonb_build_object('work_product_id',_work_product.id,'task_id',_created.id,'parent_task_id',_parent.id,'comment_id',_comment.id,'due_at',_due_at),
      _idempotency_key||':work-product',_correlation_id
    );
  ELSIF _label_norm='RELATED_WORK' AND _related_task_id IS NOT NULL THEN
    SELECT * INTO _related FROM public.tasks WHERE id=_related_task_id AND deleted_at IS NULL AND tenant_id=_parent.tenant_id;
    IF _related.id IS NOT NULL AND _related.id<>_parent.id THEN
      PERFORM public._work_graph_link_system_in_tenant(_parent.tenant_id,'TASK',_parent.id,'TASK',_related.id,'RELATED_TO',jsonb_build_object('source_comment_id',_comment.id,'classification','AI'));
    END IF;
  END IF;

  _result := jsonb_build_object(
    'label',_label_norm,
    'status',CASE WHEN _label_norm='FAILED' THEN 'FAILED' ELSE 'APPLIED' END,
    'confidence',greatest(0,least(1,coalesce(_confidence,0))),
    'task_title',nullif(btrim(_task_title),''),
    'due_at',_due_at,
    'created_task_id',_created.id,
    'created_work_product_id',_work_product.id,
    'work_product_href',CASE WHEN _work_product.id IS NOT NULL THEN '/work-products/'||_work_product.id::text ELSE NULL END,
    'related_task_id',CASE WHEN _related.id IS NOT NULL THEN _related.id ELSE NULL END,
    'model',_model,'version',_classifier_version,'classified_at',now()
  );
  UPDATE public.task_comments SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('classification',_result) WHERE id=_comment.id;
  PERFORM public._emit_outbox_event(
    _parent.tenant_id,'task.comment.classified','task_comment',_comment.id::text,
    _result||jsonb_build_object('task_id',_parent.id,'comment_id',_comment.id),
    _idempotency_key,_correlation_id
  );
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_task_message_classification_v2(uuid,text,numeric,text,uuid,timestamptz,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_task_message_classification_v2(uuid,text,numeric,text,uuid,timestamptz,text,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.persist_chat_executive_brief(
  _assistant_message_id uuid,
  _title text,
  _root_type text DEFAULT NULL,
  _root_id uuid DEFAULT NULL,
  _sources jsonb DEFAULT '[]'::jsonb,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _message public.ai_messages;
  _conversation public.ai_conversations;
  _work_product public.work_products;
  _source jsonb;
  _source_type text;
  _source_id uuid;
  _existing_id uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO _message FROM public.ai_messages WHERE id=_assistant_message_id AND role='assistant' FOR UPDATE;
  IF _message.id IS NULL THEN RAISE EXCEPTION 'AI_MESSAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO _conversation FROM public.ai_conversations WHERE id=_message.conversation_id AND deleted_at IS NULL;
  IF _conversation.id IS NULL OR _conversation.tenant_id<>_message.tenant_id THEN RAISE EXCEPTION 'AI_CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_message.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  BEGIN _existing_id:=nullif(_message.metadata->>'workProductId','')::uuid; EXCEPTION WHEN invalid_text_representation THEN _existing_id:=NULL; END;
  IF _existing_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.work_products wp WHERE wp.id=_existing_id AND wp.tenant_id=_message.tenant_id AND wp.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('id',_existing_id,'created',false,'href','/work-products/'||_existing_id::text);
  END IF;
  IF (_root_type IS NULL)<>(_root_id IS NULL) THEN RAISE EXCEPTION 'INVALID_ROOT_ENTITY' USING ERRCODE='22023'; END IF;
  IF _root_type IS NOT NULL THEN
    _root_type:=upper(_root_type);
    IF _root_type NOT IN ('WORKSPACE','MEETING','TASK','DOCUMENT','EMAIL') OR NOT public.can_view_work_entity(_root_type,_root_id) THEN RAISE EXCEPTION 'WORK_GRAPH_ENTITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
  END IF;

  INSERT INTO public.work_products(
    tenant_id,workspace_id,title,description,business_type,status,content,owner_id,created_by,
    ai_generated,current_version,primary_context_type,primary_context_id,tags
  ) VALUES (
    _message.tenant_id,_conversation.workspace_id,left(coalesce(nullif(btrim(_title),''),'Executive Brief'),300),
    left('Báo cáo từ Executive Brief trong hội thoại '||_conversation.title,2000),
    'REPORT','DRAFT',_message.content,_actor,_actor,true,1,_root_type,_root_id,
    ARRAY['EXECUTIVE_BRIEF','AI_CHAT','AUTO_REPORT']::text[]
  ) RETURNING * INTO _work_product;

  INSERT INTO public.work_product_versions(
    tenant_id,work_product_id,version,title,content,summary,provenance,ai_generated,author_id
  ) VALUES (
    _message.tenant_id,_work_product.id,1,_work_product.title,_message.content,
    'Báo cáo được tạo tự động từ Executive Brief.',
    jsonb_build_array(jsonb_build_object('entityType','AI_MESSAGE','entityId',_message.id,'conversationId',_conversation.id,'capturedAt',now())),
    true,_actor
  );
  PERFORM public._touch_work_product_graph_node(_work_product.id,1);
  IF _root_type IS NOT NULL AND _root_type IN ('TASK','DOCUMENT','MEETING') THEN
    PERFORM public._work_graph_link_system_in_tenant(_message.tenant_id,'WORK_PRODUCT',_work_product.id,_root_type,_root_id,'REFERENCES',jsonb_build_object('source','AI_CHAT','assistant_message_id',_message.id));
  END IF;
  IF jsonb_typeof(coalesce(_sources,'[]'::jsonb))='array' THEN
    FOR _source IN SELECT value FROM jsonb_array_elements(coalesce(_sources,'[]'::jsonb)) LOOP
      _source_type:=upper(coalesce(_source->>'entityType',''));
      BEGIN _source_id:=nullif(_source->>'entityId','')::uuid; EXCEPTION WHEN invalid_text_representation THEN _source_id:=NULL; END;
      IF _source_type IN ('TASK','DOCUMENT','MEETING','MEETING_ARTIFACT') AND _source_id IS NOT NULL THEN
        PERFORM public._work_graph_link_system_in_tenant(_message.tenant_id,'WORK_PRODUCT',_work_product.id,_source_type,_source_id,'REFERENCES',jsonb_build_object('source','AI_CONTEXT','assistant_message_id',_message.id));
      END IF;
    END LOOP;
  END IF;
  UPDATE public.ai_messages SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'workProductId',_work_product.id,'workProductHref','/work-products/'||_work_product.id::text,
    'workProductStatus','CREATED','workProductKind','REPORT','workProductVersion',1
  ) WHERE id=_message.id;
  PERFORM public._emit_outbox_event(
    _message.tenant_id,'work_product.created_from_chat','work_product',_work_product.id::text,
    jsonb_build_object('work_product_id',_work_product.id,'conversation_id',_conversation.id,'assistant_message_id',_message.id,'root_type',_root_type,'root_id',_root_id,'business_type','REPORT','version',1),
    _idempotency_key,_correlation_id
  );
  RETURN jsonb_build_object('id',_work_product.id,'created',true,'href','/work-products/'||_work_product.id::text,'kind','REPORT','version',1);
END;
$$;
REVOKE ALL ON FUNCTION public.persist_chat_executive_brief(uuid,text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persist_chat_executive_brief(uuid,text,text,uuid,jsonb,text,text) TO authenticated, service_role;
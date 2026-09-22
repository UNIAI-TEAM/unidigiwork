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
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _message
  FROM public.ai_messages
  WHERE id = _assistant_message_id AND role = 'assistant'
  FOR UPDATE;
  IF _message.id IS NULL THEN
    RAISE EXCEPTION 'AI_MESSAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _conversation
  FROM public.ai_conversations
  WHERE id = _message.conversation_id AND deleted_at IS NULL;
  IF _conversation.id IS NULL OR _conversation.tenant_id <> _message.tenant_id THEN
    RAISE EXCEPTION 'AI_CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_tenant_member(_message.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  BEGIN
    _existing_id := nullif(_message.metadata->>'workProductId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    _existing_id := NULL;
  END;
  IF _existing_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.work_products wp
    WHERE wp.id = _existing_id AND wp.tenant_id = _message.tenant_id AND wp.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('id', _existing_id, 'created', false, 'href', '/work-products/' || _existing_id::text);
  END IF;

  IF (_root_type IS NULL) <> (_root_id IS NULL) THEN
    RAISE EXCEPTION 'INVALID_ROOT_ENTITY' USING ERRCODE = '22023';
  END IF;
  IF _root_type IS NOT NULL THEN
    _root_type := upper(_root_type);
    IF _root_type NOT IN ('WORKSPACE','MEETING','TASK','DOCUMENT','EMAIL') OR
       NOT public.can_view_work_entity(_root_type, _root_id) THEN
      RAISE EXCEPTION 'WORK_GRAPH_ENTITY_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.work_products (
    tenant_id, workspace_id, title, description, business_type, status, content,
    owner_id, created_by, ai_generated, primary_context_type, primary_context_id, tags
  ) VALUES (
    _message.tenant_id,
    _conversation.workspace_id,
    left(coalesce(nullif(btrim(_title), ''), 'Executive Brief'), 300),
    left('Executive Brief từ hội thoại ' || _conversation.title, 2000),
    'MEMO', 'DRAFT', _message.content,
    _actor, _actor, true, _root_type, _root_id,
    ARRAY['EXECUTIVE_BRIEF','AI_CHAT']::text[]
  ) RETURNING * INTO _work_product;

  PERFORM public._touch_work_product_graph_node(_work_product.id, NULL);

  IF _root_type IS NOT NULL AND _root_type IN ('TASK','DOCUMENT','MEETING') THEN
    PERFORM public._work_graph_link_system_in_tenant(
      _message.tenant_id, 'WORK_PRODUCT', _work_product.id, _root_type, _root_id,
      'REFERENCES', jsonb_build_object('source', 'AI_CHAT', 'assistant_message_id', _message.id)
    );
  END IF;

  IF jsonb_typeof(coalesce(_sources, '[]'::jsonb)) = 'array' THEN
    FOR _source IN SELECT value FROM jsonb_array_elements(coalesce(_sources, '[]'::jsonb)) LOOP
      _source_type := upper(coalesce(_source->>'entityType', ''));
      BEGIN
        _source_id := nullif(_source->>'entityId', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        _source_id := NULL;
      END;
      IF _source_type IN ('TASK','DOCUMENT','MEETING','MEETING_ARTIFACT') AND _source_id IS NOT NULL THEN
        PERFORM public._work_graph_link_system_in_tenant(
          _message.tenant_id, 'WORK_PRODUCT', _work_product.id, _source_type, _source_id,
          'REFERENCES', jsonb_build_object('source', 'AI_CONTEXT', 'assistant_message_id', _message.id)
        );
      END IF;
    END LOOP;
  END IF;

  UPDATE public.ai_messages
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'workProductId', _work_product.id,
    'workProductHref', '/work-products/' || _work_product.id::text,
    'workProductStatus', 'CREATED'
  )
  WHERE id = _message.id;

  PERFORM public._emit_outbox_event(
    _message.tenant_id,
    'work_product.created_from_chat',
    'work_product',
    _work_product.id::text,
    jsonb_build_object(
      'work_product_id', _work_product.id,
      'conversation_id', _conversation.id,
      'assistant_message_id', _message.id,
      'root_type', _root_type,
      'root_id', _root_id
    ),
    _idempotency_key,
    _correlation_id
  );

  RETURN jsonb_build_object('id', _work_product.id, 'created', true, 'href', '/work-products/' || _work_product.id::text);
END;
$$;
REVOKE ALL ON FUNCTION public.persist_chat_executive_brief(uuid,text,text,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persist_chat_executive_brief(uuid,text,text,uuid,jsonb,text,text) TO authenticated, service_role;
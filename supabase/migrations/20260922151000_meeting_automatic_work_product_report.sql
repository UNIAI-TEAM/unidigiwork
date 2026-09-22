ALTER TABLE public.meeting_summaries
  ADD COLUMN IF NOT EXISTS report_work_product_id uuid REFERENCES public.work_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS report_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS report_error text,
  ADD COLUMN IF NOT EXISTS report_generated_at timestamptz;

ALTER TABLE public.meeting_summaries
  DROP CONSTRAINT IF EXISTS meeting_summaries_report_status_chk;
ALTER TABLE public.meeting_summaries
  ADD CONSTRAINT meeting_summaries_report_status_chk
  CHECK (report_status IN ('PENDING','GENERATING','READY','FAILED'));

CREATE INDEX IF NOT EXISTS idx_meeting_summaries_report_work_product
  ON public.meeting_summaries(report_work_product_id)
  WHERE report_work_product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_meeting_report_context(_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m public.meetings;
  _summary public.meeting_summaries;
  _tasks jsonb;
BEGIN
  _m := public._meeting_host_guard(_meeting_id);
  SELECT * INTO _summary
  FROM public.meeting_summaries
  WHERE meeting_id = _meeting_id;
  IF _summary.id IS NULL THEN
    RAISE EXCEPTION 'MEETING_SUMMARY_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'taskId', t.id,
    'title', t.title,
    'status', t.status,
    'priority', t.priority,
    'dueAt', t.due_at,
    'progressPct', coalesce(t.progress_pct, 0),
    'assignees', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', ta.user_id,
        'name', coalesce(nullif(p.display_name, ''), 'Chưa xác định'),
        'role', ta.role
      ) ORDER BY coalesce(nullif(p.display_name, ''), ta.user_id::text))
      FROM public.task_assignees ta
      LEFT JOIN public.profiles p ON p.id = ta.user_id
      WHERE ta.task_id = t.id
    ), '[]'::jsonb)
  ) ORDER BY t.due_at NULLS LAST, t.created_at), '[]'::jsonb)
  INTO _tasks
  FROM public.meeting_action_item_states s
  JOIN public.tasks t ON t.id = s.task_id AND t.deleted_at IS NULL
  WHERE s.meeting_id = _meeting_id
    AND s.status = 'CONVERTED_TO_TASK';

  RETURN jsonb_build_object(
    'meeting', jsonb_build_object(
      'id', _m.id,
      'title', _m.title,
      'agenda', _m.agenda,
      'workspaceId', _m.workspace_id,
      'startAt', _m.start_at,
      'endAt', _m.end_at,
      'status', _m.status
    ),
    'summary', jsonb_build_object(
      'id', _summary.id,
      'version', _summary.version,
      'status', _summary.status,
      'summary', _summary.summary,
      'highlights', _summary.highlights,
      'decisions', _summary.decisions,
      'actionItems', _summary.action_items,
      'risks', _summary.risks,
      'openQuestions', _summary.open_questions,
      'sources', _summary.sources,
      'generatedAt', _summary.generated_at
    ),
    'tasks', _tasks,
    'report', jsonb_build_object(
      'workProductId', _summary.report_work_product_id,
      'status', _summary.report_status,
      'error', _summary.report_error,
      'generatedAt', _summary.report_generated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_meeting_report_generating(
  _meeting_id uuid,
  _summary_version integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.meetings;
BEGIN
  _m := public._meeting_host_guard(_meeting_id);
  UPDATE public.meeting_summaries
  SET report_status = 'GENERATING', report_error = NULL
  WHERE meeting_id = _meeting_id AND version = _summary_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_SUMMARY_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_meeting_report_failed(
  _meeting_id uuid,
  _summary_version integer,
  _error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.meetings;
BEGIN
  _m := public._meeting_host_guard(_meeting_id);
  UPDATE public.meeting_summaries
  SET report_status = 'FAILED', report_error = left(coalesce(_error, 'REPORT_GENERATION_FAILED'), 1000)
  WHERE meeting_id = _meeting_id AND version = _summary_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_meeting_report(
  _meeting_id uuid,
  _summary_version integer,
  _content text,
  _report_metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _summary public.meeting_summaries;
  _work_product public.work_products;
  _work_product_id uuid;
  _task record;
  _assignee record;
  _provenance jsonb;
  _version_created boolean := false;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(_content), '') IS NULL THEN RAISE EXCEPTION 'REPORT_CONTENT_REQUIRED' USING ERRCODE='22023'; END IF;

  _m := public._meeting_host_guard(_meeting_id);
  SELECT * INTO _summary
  FROM public.meeting_summaries
  WHERE meeting_id = _meeting_id
  FOR UPDATE;
  IF _summary.id IS NULL THEN RAISE EXCEPTION 'MEETING_SUMMARY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _summary.version <> _summary_version THEN
    RAISE EXCEPTION 'MEETING_SUMMARY_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  _work_product_id := md5(_meeting_id::text || ':MEETING_REPORT')::uuid;
  _provenance := jsonb_build_array(jsonb_build_object(
    'entityType', 'MEETING',
    'entityId', _meeting_id,
    'summaryId', _summary.id,
    'summaryVersion', _summary.version,
    'transcriptChecksum', _summary.transcript_checksum,
    'reportMetadata', coalesce(_report_metadata, '{}'::jsonb),
    'capturedAt', now()
  ));

  INSERT INTO public.work_products(
    id, tenant_id, workspace_id, title, description, business_type, status, content,
    owner_id, created_by, ai_generated, current_version, primary_context_type,
    primary_context_id, tags
  ) VALUES (
    _work_product_id, _m.tenant_id, _m.workspace_id,
    left('Báo cáo cuộc họp — ' || _m.title, 300),
    left('Báo cáo tự động từ biên bản, quyết định và công việc đã xác nhận của cuộc họp.', 2000),
    'REPORT', 'DRAFT', _content, _actor, _actor, true, _summary.version,
    'MEETING', _meeting_id,
    ARRAY['MEETING_REPORT','AUTO_REPORT','FULL_REPORT']::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    current_version = greatest(public.work_products.current_version, EXCLUDED.current_version),
    updated_at = now()
  RETURNING * INTO _work_product;

  INSERT INTO public.work_product_versions(
    tenant_id, work_product_id, version, title, content, summary, provenance, ai_generated, author_id
  ) VALUES (
    _m.tenant_id, _work_product.id, _summary.version, _work_product.title, _content,
    'Báo cáo tự động từ cuộc họp, gồm mục tiêu, KPI, deadline, phân công và tiến độ Work Graph.',
    _provenance, true, _actor
  )
  ON CONFLICT (work_product_id, version) DO NOTHING;
  GET DIAGNOSTICS _version_created = ROW_COUNT;

  PERFORM public._touch_work_product_graph_node(_work_product.id, _summary.version);
  PERFORM public._work_graph_link_system_in_tenant(
    _m.tenant_id, 'MEETING', _meeting_id, 'WORK_PRODUCT', _work_product.id, 'GENERATES',
    jsonb_build_object('source','MEETING_REPORT','summary_version',_summary.version)
  );

  FOR _task IN
    SELECT t.id
    FROM public.meeting_action_item_states s
    JOIN public.tasks t ON t.id = s.task_id AND t.deleted_at IS NULL
    WHERE s.meeting_id = _meeting_id AND s.status = 'CONVERTED_TO_TASK'
  LOOP
    PERFORM public._work_graph_link_system_in_tenant(
      _m.tenant_id, 'WORK_PRODUCT', _work_product.id, 'TASK', _task.id, 'REFERENCES',
      jsonb_build_object('source','MEETING_REPORT','summary_version',_summary.version)
    );
    FOR _assignee IN SELECT user_id FROM public.task_assignees WHERE task_id = _task.id AND role = 'assignee' LOOP
      PERFORM public._work_graph_link_system_in_tenant(
        _m.tenant_id, 'WORK_PRODUCT', _work_product.id, 'PERSON', _assignee.user_id, 'ASSIGNED_TO',
        jsonb_build_object('source','MEETING_REPORT','task_id',_task.id)
      );
    END LOOP;
  END LOOP;

  UPDATE public.meeting_summaries
  SET report_work_product_id = _work_product.id,
      report_status = 'READY',
      report_error = NULL,
      report_generated_at = now()
  WHERE id = _summary.id;

  IF _version_created THEN
    PERFORM public._emit_outbox_event(
      _m.tenant_id, 'work_product.created_from_meeting', 'work_product', _work_product.id::text,
      jsonb_build_object(
        'work_product_id', _work_product.id,
        'meeting_id', _meeting_id,
        'summary_version', _summary.version,
        'business_type', 'REPORT',
        'version', _summary.version,
        'report_format', 'FULL_REPORT'
      ), _idempotency_key, _correlation_id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', _work_product.id,
    'created', _version_created,
    'href', '/work-products/' || _work_product.id::text,
    'mobileHref', '/m/work-products/' || _work_product.id::text,
    'status', 'READY',
    'version', _summary.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_meeting_report_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_meeting_report_generating(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_meeting_report_failed(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.persist_meeting_report(uuid, integer, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meeting_report_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_meeting_report_generating(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_meeting_report_failed(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_meeting_report(uuid, integer, text, jsonb, text, text) TO authenticated, service_role;
-- MEETING INTELLIGENCE V1 — artifacts mở rộng + action item confirmation

ALTER TABLE public.meeting_summaries
  ADD COLUMN IF NOT EXISTS risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS followup jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS transcript_checksum text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DROP FUNCTION IF EXISTS public.save_meeting_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, integer);

CREATE OR REPLACE FUNCTION public.save_meeting_summary(
  _meeting_id uuid,
  _status text,
  _model text,
  _summary text,
  _highlights jsonb,
  _decisions jsonb,
  _action_items jsonb,
  _sources jsonb,
  _segment_count integer,
  _risks jsonb DEFAULT '[]'::jsonb,
  _open_questions jsonb DEFAULT '[]'::jsonb,
  _followup jsonb DEFAULT '{}'::jsonb,
  _transcript_checksum text DEFAULT NULL
)
RETURNS public.meeting_summaries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _m public.meetings; _row public.meeting_summaries;
BEGIN
  _m := public._meeting_host_guard(_meeting_id);
  IF _status NOT IN ('ready','partial','failed') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: status' USING ERRCODE='22000';
  END IF;

  INSERT INTO public.meeting_summaries AS ms
    (tenant_id, meeting_id, status, model, summary, highlights, decisions, action_items, sources,
     segment_count, generated_by, generated_at, risks, open_questions, followup, transcript_checksum, version)
  VALUES
    (_m.tenant_id, _meeting_id, _status, _model, coalesce(_summary,''),
     coalesce(_highlights,'[]'::jsonb), coalesce(_decisions,'[]'::jsonb), coalesce(_action_items,'[]'::jsonb),
     coalesce(_sources,'[]'::jsonb), greatest(0, coalesce(_segment_count,0)), auth.uid(), now(),
     coalesce(_risks,'[]'::jsonb), coalesce(_open_questions,'[]'::jsonb), coalesce(_followup,'{}'::jsonb),
     _transcript_checksum, 1)
  ON CONFLICT (meeting_id) DO UPDATE SET
    status = EXCLUDED.status,
    model = EXCLUDED.model,
    summary = EXCLUDED.summary,
    highlights = EXCLUDED.highlights,
    decisions = EXCLUDED.decisions,
    action_items = EXCLUDED.action_items,
    sources = EXCLUDED.sources,
    segment_count = EXCLUDED.segment_count,
    generated_by = EXCLUDED.generated_by,
    generated_at = EXCLUDED.generated_at,
    risks = EXCLUDED.risks,
    open_questions = EXCLUDED.open_questions,
    followup = EXCLUDED.followup,
    transcript_checksum = EXCLUDED.transcript_checksum,
    version = ms.version + 1
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_meeting_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, integer, jsonb, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_meeting_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, integer, jsonb, jsonb, jsonb, text) TO authenticated;

-- ============ action item states ============
CREATE TABLE IF NOT EXISTS public.meeting_action_item_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PROPOSED',
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_action_item_states_status_chk
    CHECK (status IN ('PROPOSED','CONVERTED_TO_TASK','DISMISSED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_action_item_states_key
  ON public.meeting_action_item_states(meeting_id, item_key);

GRANT SELECT ON public.meeting_action_item_states TO authenticated;
GRANT ALL ON public.meeting_action_item_states TO service_role;
ALTER TABLE public.meeting_action_item_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_action_item_states_select_tenant_member"
  ON public.meeting_action_item_states FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_meeting_action_item_states_updated_at
  BEFORE UPDATE ON public.meeting_action_item_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ confirm / dismiss commands ============
CREATE OR REPLACE FUNCTION public.confirm_meeting_action_item(
  _meeting_id uuid,
  _item_key text,
  _workspace_id uuid,
  _title text,
  _description text DEFAULT NULL,
  _due_at timestamptz DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL
)
RETURNS public.meeting_action_item_states
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _row public.meeting_action_item_states;
  _task public.tasks;
  _ws_tenant uuid;
  _idem text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF coalesce(btrim(_item_key),'') = '' OR coalesce(btrim(_title),'') = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: item' USING ERRCODE='22000';
  END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  _ws_tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _ws_tenant IS DISTINCT FROM _m.tenant_id THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  -- Idempotency: đã chuyển thành công việc thì trả lại bản ghi cũ
  SELECT * INTO _row FROM public.meeting_action_item_states
   WHERE meeting_id = _meeting_id AND item_key = _item_key
   FOR UPDATE;
  IF FOUND AND _row.status = 'CONVERTED_TO_TASK' AND _row.task_id IS NOT NULL THEN
    RETURN _row;
  END IF;

  _idem := 'meeting-action:' || _meeting_id::text || ':' || left(_item_key, 80);

  _task := public.create_task(
    _workspace_id, left(_title, 200), _description, 'normal'::task_priority,
    _due_at, _assignee_id, _idem, _idem
  );

  INSERT INTO public.meeting_action_item_states AS s
    (tenant_id, meeting_id, item_key, title, status, task_id, confirmed_by, confirmed_at)
  VALUES
    (_m.tenant_id, _meeting_id, _item_key, left(_title,200), 'CONVERTED_TO_TASK', _task.id, _actor, now())
  ON CONFLICT (meeting_id, item_key) DO UPDATE SET
    status = 'CONVERTED_TO_TASK',
    task_id = EXCLUDED.task_id,
    title = EXCLUDED.title,
    confirmed_by = EXCLUDED.confirmed_by,
    confirmed_at = EXCLUDED.confirmed_at
  RETURNING * INTO _row;

  PERFORM public._work_graph_link_system(
    'MEETING', _meeting_id, 'TASK', _task.id, 'GENERATES',
    jsonb_build_object('origin', 'meeting_intelligence', 'item_key', _item_key)
  );

  PERFORM public._emit_outbox_event(
    _m.tenant_id, 'meeting.action_item.confirmed', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'task_id', _task.id,
      'item_key', _item_key, 'confirmed_by', _actor),
    _idem, _idem);

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_meeting_action_item(
  _meeting_id uuid,
  _item_key text,
  _title text DEFAULT ''
)
RETURNS public.meeting_action_item_states
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings; _row public.meeting_action_item_states;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.meeting_action_item_states AS s
    (tenant_id, meeting_id, item_key, title, status, confirmed_by, confirmed_at)
  VALUES (_m.tenant_id, _meeting_id, _item_key, left(coalesce(_title,''),200), 'DISMISSED', _actor, now())
  ON CONFLICT (meeting_id, item_key) DO UPDATE SET
    status = CASE WHEN s.status = 'CONVERTED_TO_TASK' THEN s.status ELSE 'DISMISSED' END,
    confirmed_by = _actor,
    confirmed_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_meeting_action_item(uuid, text, uuid, text, text, timestamptz, uuid) FROM public;
REVOKE ALL ON FUNCTION public.dismiss_meeting_action_item(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_meeting_action_item(uuid, text, uuid, text, text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_meeting_action_item(uuid, text, text) TO authenticated;
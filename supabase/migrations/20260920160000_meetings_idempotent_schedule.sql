-- Idempotency thật cho schedule_meeting.
--
-- Trước đây `_idempotency_key` chỉ được chuyển tiếp xuống `record_usage` và
-- `_emit_outbox_event`, còn lệnh INSERT vào `public.meetings` thì không đụng
-- tới nó. Hệ quả: một lệnh tạo phòng bị gửi lại — mất response giữa đường,
-- người dùng bấm lại, client tự retry — lại sinh thêm một cuộc họp mới. Đó
-- đúng là thứ mà idempotency key sinh ra để chặn; mang khóa theo mà không dùng
-- thì lệnh vẫn không idempotent.
--
-- Sau migration này: gửi lại đúng khóa cũ trả về đúng cuộc họp cũ, không tạo
-- bản thứ hai và không tính quota `meetings.scheduled_per_month` lần nữa.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.meetings.idempotency_key IS
  'Khóa chống tạo trùng do client sinh, duy nhất theo (tenant, người tạo). Một khóa cho một ý định tạo phòng, giữ nguyên qua mọi lần thử lại; gửi lại cùng khóa trả về cuộc họp đã tạo thay vì tạo mới.';

-- Khóa thuộc về người gọi, không dùng chung cả tenant: nếu chỉ khóa theo
-- (tenant, key) thì một người trùng khóa với người khác sẽ nhận về cuộc họp
-- không phải của mình. Bỏ qua bản đã xoá mềm để khóa được giải phóng sau khi
-- cuộc họp bị xoá — cùng luật với nhánh đọc lại bên dưới.
CREATE UNIQUE INDEX IF NOT EXISTS meetings_tenant_actor_idempotency_uidx
  ON public.meetings (tenant_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- ------------------------------------ schedule_meeting (positional overload) --

CREATE OR REPLACE FUNCTION public.schedule_meeting(_workspace_id uuid, _title text, _agenda text, _start_at timestamp with time zone, _end_at timestamp with time zone, _timezone text, _rrule text, _location text, _participant_ids uuid[], _idempotency_key text, _correlation_id text)
 RETURNS meetings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _m public.meetings; _p uuid;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023'; END IF;

  -- Lần gửi lại: trả về bản cũ trước cả khi chạm tới quota.
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO _m FROM public.meetings
     WHERE tenant_id = _tenant AND created_by = _actor
       AND idempotency_key = _idempotency_key AND deleted_at IS NULL;
    IF FOUND THEN RETURN _m; END IF;
  END IF;

  IF NOT public.check_quota(_tenant, 'meetings.scheduled_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'meetings.scheduled_per_month', 1);
  END IF;
  INSERT INTO public.meetings(workspace_id, title, agenda, start_at, end_at, timezone, rrule, location, created_by, updated_by, idempotency_key)
  VALUES (_workspace_id, _title, _agenda, _start_at, _end_at, COALESCE(_timezone,'UTC'), _rrule, _location, _actor, _actor, _idempotency_key)
  ON CONFLICT (tenant_id, created_by, idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL
  DO NOTHING
  RETURNING * INTO _m;

  -- Hai lệnh song song cùng khóa: bản thua không có RETURNING, đọc lại bản thắng.
  IF NOT FOUND THEN
    SELECT * INTO _m FROM public.meetings
     WHERE tenant_id = _tenant AND created_by = _actor
       AND idempotency_key = _idempotency_key AND deleted_at IS NULL;
    -- Không rơi vào đây được (chỉ DO NOTHING khi đã có bản trùng khóa), nhưng
    -- thà ném lỗi còn hơn trả về một bản ghi rỗng cho tầng trên.
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
    RETURN _m;
  END IF;

  INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _actor, 'host') ON CONFLICT DO NOTHING;
  IF _participant_ids IS NOT NULL THEN
    FOREACH _p IN ARRAY _participant_ids LOOP
      INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _p, 'participant') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  PERFORM public.record_usage(_tenant, 'meetings.scheduled_per_month', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'meeting.meeting.scheduled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'start_at', _m.start_at, 'end_at', _m.end_at, 'timezone', _m.timezone,
      'participants', COALESCE(_participant_ids, ARRAY[]::uuid[])),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $function$;

-- -------------------------------- schedule_meeting (named-defaults overload) --

CREATE OR REPLACE FUNCTION public.schedule_meeting(_workspace_id uuid, _title text, _start_at timestamp with time zone, _end_at timestamp with time zone, _agenda text DEFAULT NULL::text, _timezone text DEFAULT 'UTC'::text, _rrule text DEFAULT NULL::text, _location text DEFAULT NULL::text, _participant_ids uuid[] DEFAULT NULL::uuid[], _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS meetings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _m public.meetings; _p uuid;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023'; END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO _m FROM public.meetings
     WHERE tenant_id = _tenant AND created_by = _actor
       AND idempotency_key = _idempotency_key AND deleted_at IS NULL;
    IF FOUND THEN RETURN _m; END IF;
  END IF;

  IF NOT public.check_quota(_tenant, 'meetings.scheduled_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'meetings.scheduled_per_month', 1);
  END IF;
  INSERT INTO public.meetings(workspace_id, title, agenda, start_at, end_at, timezone, rrule, location, created_by, updated_by, idempotency_key)
  VALUES (_workspace_id, _title, _agenda, _start_at, _end_at, COALESCE(_timezone,'UTC'), _rrule, _location, _actor, _actor, _idempotency_key)
  ON CONFLICT (tenant_id, created_by, idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL
  DO NOTHING
  RETURNING * INTO _m;

  IF NOT FOUND THEN
    SELECT * INTO _m FROM public.meetings
     WHERE tenant_id = _tenant AND created_by = _actor
       AND idempotency_key = _idempotency_key AND deleted_at IS NULL;
    -- Không rơi vào đây được (chỉ DO NOTHING khi đã có bản trùng khóa), nhưng
    -- thà ném lỗi còn hơn trả về một bản ghi rỗng cho tầng trên.
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
    RETURN _m;
  END IF;

  INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _actor, 'host') ON CONFLICT DO NOTHING;
  IF _participant_ids IS NOT NULL THEN
    FOREACH _p IN ARRAY _participant_ids LOOP
      INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _p, 'participant') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  PERFORM public.record_usage(_tenant, 'meetings.scheduled_per_month', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'meeting.meeting.scheduled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'start_at', _m.start_at, 'end_at', _m.end_at, 'timezone', _m.timezone,
      'participants', COALESCE(_participant_ids, ARRAY[]::uuid[])),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $function$;

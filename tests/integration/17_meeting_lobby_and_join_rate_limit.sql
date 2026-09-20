-- ==========================================================================
-- Integration test: cửa cấp vé vào phòng họp (ADR-1E-001)
--
-- Chứng minh bằng RPC thật, không mô phỏng:
--   1. Mặc định 'tenant_open' — hành vi cũ giữ nguyên, thành viên tenant tự vào.
--   2. 'invite_only' chặn thành viên tenant chưa được mời...
--   3. ...nhưng không chặn người đã có trong meeting_participants.
--   4. Chỉ chủ toạ/người tạo mới đổi được chính sách.
--   5. Rate limit 10 vé/phút cho mỗi (user, meeting).
--   6. Rate limit tính theo từng phòng, không rò sang phòng khác.
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_mtg_lobby', 'itest-mtg-lobby-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-M');

-- OWNER_B là thành viên tenant nhưng KHÔNG được mời vào cuộc họp.
INSERT INTO public.tenant_members(tenant_id, user_id, status)
SELECT tenant_id, :OWNER_B::uuid, 'active' FROM _t
ON CONFLICT DO NOTHING;

SELECT public._test_seed_entitlement(tenant_id, 'meetings.scheduled_per_month', true, 100) FROM _t;
SELECT public._test_seed_entitlement(tenant_id, 'meetings.conference', true, NULL) FROM _t;
SELECT public._test_seed_entitlement(tenant_id, 'meeting_participant_minutes', true, 100000) FROM _t;

CREATE TEMP TABLE _m AS
SELECT (public.schedule_meeting(
  (SELECT workspace_id FROM _t), 'itest lobby', now(), now() + interval '1 hour',
  NULL, 'Asia/Ho_Chi_Minh', NULL, NULL, NULL, 'mtg-lobby-1', NULL)).*;

-- ---- 1) mặc định phải là 'tenant_open' -----------------------------------
DO $$
DECLARE _p text;
BEGIN
  SELECT access_policy INTO _p FROM public.meetings WHERE id = (SELECT id FROM _m);
  IF _p IS DISTINCT FROM 'tenant_open' THEN
    RAISE EXCEPTION 'FAIL lobby-default: access_policy = % (mong đợi tenant_open)', _p;
  END IF;
  RAISE NOTICE 'OK lobby-default: cuộc họp mới mặc định tenant_open';
END $$;

-- ---- 2) tenant_open: thành viên tenant chưa được mời vẫn vào được ---------
-- (giữ nguyên hành vi trước migration — không được phá cuộc họp đang chạy)
DO $$
DECLARE _out jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '8236c840-8676-48ba-9f9b-497663e1e905', 'role','authenticated')::text, true);
  _out := public.issue_meeting_join_token((SELECT id FROM _m), 'fp-open-1', now() + interval '15 minutes');
  IF _out->>'role' IS NULL THEN
    RAISE EXCEPTION 'FAIL lobby-open: không cấp được vé cho thành viên tenant';
  END IF;
  RAISE NOTICE 'OK lobby-open: thành viên tenant tự vào được (role=%)', _out->>'role';
END $$;

-- ---- 3) chỉ chủ toạ mới đổi được chính sách --------------------------------
DO $$
DECLARE _err text;
BEGIN
  -- OWNER_B vừa bị auto-thêm làm 'participant' ở bước trên, không phải host.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '8236c840-8676-48ba-9f9b-497663e1e905', 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.set_meeting_access_policy((SELECT id FROM _m), 'invite_only');
    RAISE EXCEPTION 'FAIL lobby-authz: participant đổi được chính sách vào phòng';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~ 'MEETING_ACCESS_DENIED' THEN
      RAISE EXCEPTION 'FAIL lobby-authz: lỗi lạ %', _err;
    END IF;
    RAISE NOTICE 'OK lobby-authz: participant bị từ chối (%)', _err;
  END;
END $$;

-- ---- 4) invite_only chặn thành viên tenant chưa được mời -------------------
DO $$
DECLARE _err text; _mid uuid;
BEGIN
  -- Cuộc họp thứ hai, để OWNER_B chưa từng được thêm vào.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '999a12c6-85b6-4327-8469-b91fc7a8e765', 'role','authenticated')::text, true);
  _mid := (public.schedule_meeting(
    (SELECT workspace_id FROM _t), 'itest kín', now(), now() + interval '1 hour',
    NULL, 'Asia/Ho_Chi_Minh', NULL, NULL, NULL, 'mtg-lobby-2', NULL)).id;
  PERFORM public.set_meeting_access_policy(_mid, 'invite_only');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '8236c840-8676-48ba-9f9b-497663e1e905', 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.issue_meeting_join_token(_mid, 'fp-kin-1', now() + interval '15 minutes');
    RAISE EXCEPTION 'FAIL lobby-invite-only: thành viên tenant vào được phòng kín';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~ 'MEETING_ACCESS_DENIED' THEN
      RAISE EXCEPTION 'FAIL lobby-invite-only: lỗi lạ %', _err;
    END IF;
    RAISE NOTICE 'OK lobby-invite-only: người chưa mời bị chặn (%)', _err;
  END;

  -- ...nhưng chủ toạ (đã là participant) vẫn vào bình thường.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '999a12c6-85b6-4327-8469-b91fc7a8e765', 'role','authenticated')::text, true);
  IF (public.issue_meeting_join_token(_mid, 'fp-kin-2', now() + interval '15 minutes'))->>'role' IS NULL THEN
    RAISE EXCEPTION 'FAIL lobby-invite-only: chủ toạ bị chặn khỏi phòng của chính mình';
  END IF;
  RAISE NOTICE 'OK lobby-invite-only: chủ toạ vẫn vào được';
END $$;

-- ---- 5) rate limit: vé thứ 11 trong một phút bị chặn ----------------------
DO $$
DECLARE _err text; _mid uuid; _i int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '999a12c6-85b6-4327-8469-b91fc7a8e765', 'role','authenticated')::text, true);
  _mid := (public.schedule_meeting(
    (SELECT workspace_id FROM _t), 'itest rate', now(), now() + interval '1 hour',
    NULL, 'Asia/Ho_Chi_Minh', NULL, NULL, NULL, 'mtg-rate-1', NULL)).id;

  -- 10 vé đầu phải qua: vào phòng + 5 lần tự vào lại vẫn nằm dưới trần.
  FOR _i IN 1..10 LOOP
    PERFORM public.issue_meeting_join_token(_mid, 'fp-rate-'||_i, now() + interval '15 minutes');
  END LOOP;
  RAISE NOTICE 'OK rate-limit: 10 vé đầu được cấp bình thường';

  BEGIN
    PERFORM public.issue_meeting_join_token(_mid, 'fp-rate-11', now() + interval '15 minutes');
    RAISE EXCEPTION 'FAIL rate-limit: vé thứ 11 vẫn được cấp';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~ 'RATE_LIMITED' THEN
      RAISE EXCEPTION 'FAIL rate-limit: lỗi lạ %', _err;
    END IF;
    RAISE NOTICE 'OK rate-limit: vé thứ 11 bị chặn (%)', _err;
  END;

  -- ---- 6) trần tính theo từng phòng, không rò sang phòng khác -------------
  _mid := (public.schedule_meeting(
    (SELECT workspace_id FROM _t), 'itest rate 2', now(), now() + interval '1 hour',
    NULL, 'Asia/Ho_Chi_Minh', NULL, NULL, NULL, 'mtg-rate-2', NULL)).id;
  IF (public.issue_meeting_join_token(_mid, 'fp-rate2-1', now() + interval '15 minutes'))->>'role' IS NULL THEN
    RAISE EXCEPTION 'FAIL rate-limit-scope: bị chặn ở phòng khác dù chưa xin vé nào';
  END IF;
  RAISE NOTICE 'OK rate-limit-scope: trần áp theo từng phòng';
END $$;

-- ---- 7) outbox ghi lại việc đổi chính sách --------------------------------
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.outbox_events
   WHERE event_type = 'meeting.access_policy.changed'
     AND tenant_id = (SELECT tenant_id FROM _t);
  IF _n < 1 THEN
    RAISE EXCEPTION 'FAIL lobby-outbox: không có outbox event nào cho đổi chính sách';
  END IF;
  RAISE NOTICE 'OK lobby-outbox: % event ghi nhận', _n;
END $$;

ROLLBACK;
\echo === PASS 17_meeting_lobby_and_join_rate_limit ===

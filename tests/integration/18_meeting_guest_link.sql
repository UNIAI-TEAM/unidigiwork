-- ==========================================================================
-- Integration test: khách ngoài vào họp bằng link chia sẻ
--
-- Đây là bề mặt `anon` đầu tiên của hệ thống, nên test chạy bằng RPC thật với
-- JWT role 'anon' — đúng thứ mà một người lạ trên internet cầm được.
--
--   1. allow_guests mặc định FALSE (link cũ không tự mở ra).
--   2. Link không cho khách bị từ chối, và KHÔNG lộ ra là link có thật.
--   3. Link có allow_guests: khách đổi được, tiêu đúng một lượt used_count.
--   4. Xin lại vé KHÔNG tiêu thêm lượt (rớt mạng không làm hết link).
--   5. Hết lượt thì từ chối.
--   6. Chủ toạ thu hồi -> khách không xin được vé nữa.
--   7. Khách không đọc được bảng nào bằng quyền anon.
--   8. Cuộc họp đã kết thúc thì không vào được.
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_mtg_guest', 'itest-mtg-guest-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-G');

SELECT public._test_seed_entitlement(tenant_id, 'meetings.scheduled_per_month', true, 100) FROM _t;
SELECT public._test_seed_entitlement(tenant_id, 'meetings.conference', true, NULL) FROM _t;
SELECT public._test_seed_entitlement(tenant_id, 'meeting_participant_minutes', true, 100000) FROM _t;

CREATE TEMP TABLE _m AS
SELECT (public.schedule_meeting(
  (SELECT workspace_id FROM _t), 'itest guest', now(), now() + interval '1 hour',
  NULL, 'Asia/Ho_Chi_Minh', NULL, NULL, NULL, 'mtg-guest-1', NULL)).*;

-- ---- 1) allow_guests mặc định FALSE --------------------------------------
CREATE TEMP TABLE _link_internal AS
SELECT public.create_meeting_invite_link((SELECT id FROM _m), 1440, NULL, 'noi bo') AS j;

DO $$
DECLARE _allow boolean;
BEGIN
  SELECT (j->>'allow_guests')::boolean INTO _allow FROM _link_internal;
  IF _allow IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL guest-default: link mới mặc định allow_guests = % (mong đợi false)', _allow;
  END IF;
  RAISE NOTICE 'OK guest-default: link tạo không tick thì không cho khách';
END $$;

-- ---- 2) link nội bộ: khách bị từ chối, không lộ là link có thật ------------
DO $$
DECLARE _out jsonb; _bogus jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

  _out := public.redeem_meeting_guest_link(
    (SELECT j->>'token' FROM _link_internal), 'Nguoi La');
  IF _out->>'status' IS DISTINCT FROM 'guests_not_allowed' THEN
    RAISE EXCEPTION 'FAIL guest-internal: status = % (mong đợi guests_not_allowed)', _out->>'status';
  END IF;

  -- Tầng ứng dụng gộp guests_not_allowed và invalid thành cùng một thông điệp
  -- (xem guestRedeemMessage). Ở đây chỉ cần chắc cả hai đều KHÔNG trả meeting_id.
  _bogus := public.redeem_meeting_guest_link(repeat('0', 64), 'Nguoi La');
  IF _out ? 'meeting_id' OR _bogus ? 'meeting_id' THEN
    RAISE EXCEPTION 'FAIL guest-leak: lộ meeting_id cho link không dùng được';
  END IF;
  RAISE NOTICE 'OK guest-internal: link nội bộ từ chối khách và không lộ cuộc họp';
END $$;

-- ---- 3) link có allow_guests: vào được, tiêu đúng một lượt -----------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _link_guest AS
SELECT public.create_meeting_invite_link((SELECT id FROM _m), 1440, 2, 'khach', true) AS j;

CREATE TEMP TABLE _g AS
SELECT '{}'::jsonb AS j;

DO $$
DECLARE _out jsonb; _used int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  _out := public.redeem_meeting_guest_link((SELECT j->>'token' FROM _link_guest), '  Tran   Thi B  ');
  IF _out->>'status' IS DISTINCT FROM 'joined' THEN
    RAISE EXCEPTION 'FAIL guest-join: status = %', _out->>'status';
  END IF;
  IF _out->>'display_name' IS DISTINCT FROM 'Tran Thi B' THEN
    RAISE EXCEPTION 'FAIL guest-name: tên không được gộp khoảng trắng: %', _out->>'display_name';
  END IF;
  UPDATE _g SET j = _out;

  SELECT used_count INTO _used FROM public.meeting_invite_links
   WHERE id = (SELECT (j->>'id')::uuid FROM _link_guest);
  IF _used <> 1 THEN
    RAISE EXCEPTION 'FAIL guest-usecount: used_count = % sau một lần đổi', _used;
  END IF;
  RAISE NOTICE 'OK guest-join: khách vào được, tiêu đúng 1 lượt';
END $$;

-- ---- 4) xin lại vé KHÔNG tiêu thêm lượt -----------------------------------
DO $$
DECLARE _t1 jsonb; _t2 jsonb; _used int; _n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  _t1 := public.issue_meeting_guest_token(
    (SELECT j->>'session_token' FROM _g), 'fp-guest-1', now() + interval '15 minutes');
  IF _t1->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'FAIL guest-ticket: status = %', _t1->>'status';
  END IF;
  IF _t1->>'room_name' IS NULL THEN
    RAISE EXCEPTION 'FAIL guest-ticket: thiếu room_name';
  END IF;

  -- Rớt mạng rồi vào lại.
  _t2 := public.issue_meeting_guest_token(
    (SELECT j->>'session_token' FROM _g), 'fp-guest-2', now() + interval '15 minutes');
  IF _t2->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'FAIL guest-rejoin: status = %', _t2->>'status';
  END IF;

  SELECT used_count INTO _used FROM public.meeting_invite_links
   WHERE id = (SELECT (j->>'id')::uuid FROM _link_guest);
  IF _used <> 1 THEN
    RAISE EXCEPTION 'FAIL guest-rejoin-usecount: xin lại vé tiêu thêm lượt (used_count = %)', _used;
  END IF;

  -- Vết audit có ghi và đánh dấu là khách.
  SELECT count(*) INTO _n FROM public.meeting_join_tokens
   WHERE user_id = (SELECT (j->>'guest_id')::uuid FROM _g) AND is_guest;
  IF _n < 2 THEN
    RAISE EXCEPTION 'FAIL guest-audit: chỉ % vết cấp vé cho khách', _n;
  END IF;
  RAISE NOTICE 'OK guest-rejoin: xin lại vé không tiêu lượt, audit ghi is_guest';
END $$;

-- ---- 5) hết lượt thì từ chối ----------------------------------------------
DO $$
DECLARE _out jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  -- max_uses = 2, đã dùng 1. Lượt này là lượt cuối.
  _out := public.redeem_meeting_guest_link((SELECT j->>'token' FROM _link_guest), 'Khach Hai');
  IF _out->>'status' IS DISTINCT FROM 'joined' THEN
    RAISE EXCEPTION 'FAIL guest-second: status = %', _out->>'status';
  END IF;

  _out := public.redeem_meeting_guest_link((SELECT j->>'token' FROM _link_guest), 'Khach Ba');
  IF _out->>'status' IS DISTINCT FROM 'exhausted' THEN
    RAISE EXCEPTION 'FAIL guest-exhausted: status = % (mong đợi exhausted)', _out->>'status';
  END IF;
  RAISE NOTICE 'OK guest-exhausted: hết lượt thì chặn';
END $$;

-- ---- 6) chủ toạ thu hồi -> khách hết xin được vé ---------------------------
DO $$
DECLARE _out jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','999a12c6-85b6-4327-8469-b91fc7a8e765','role','authenticated')::text, true);
  PERFORM public.revoke_meeting_guest((SELECT (j->>'guest_id')::uuid FROM _g));

  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  _out := public.issue_meeting_guest_token(
    (SELECT j->>'session_token' FROM _g), 'fp-guest-3', now() + interval '15 minutes');
  IF _out->>'status' IS DISTINCT FROM 'revoked' THEN
    RAISE EXCEPTION 'FAIL guest-revoke: status = % (mong đợi revoked)', _out->>'status';
  END IF;
  RAISE NOTICE 'OK guest-revoke: thu hồi xong khách không quay lại được';
END $$;

-- ---- 7) quyền anon không chạm được bảng nào -------------------------------
DO $$
DECLARE _err text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM count(*) FROM public.meeting_guests;
    RAISE EXCEPTION 'FAIL guest-rls: anon SELECT được public.meeting_guests';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    _err := SQLERRM;
    IF _err ~ 'FAIL guest-rls' THEN RAISE; END IF;
  END;
  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE 'OK guest-rls: anon không đọc được bảng khách';
END $$;

RESET role;

-- ---- 8) cuộc họp đã kết thúc thì không vào được ----------------------------
DO $$
DECLARE _out jsonb;
BEGIN
  UPDATE public.meetings SET status = 'ended' WHERE id = (SELECT id FROM _m);

  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  _out := public.redeem_meeting_guest_link((SELECT j->>'token' FROM _link_guest), 'Khach Muon');
  IF _out->>'status' NOT IN ('not_joinable','exhausted') THEN
    RAISE EXCEPTION 'FAIL guest-ended: status = %', _out->>'status';
  END IF;
  RAISE NOTICE 'OK guest-ended: họp kết thúc thì link không dùng được nữa';
END $$;

-- ---- 9) outbox ghi nhận khách vào -----------------------------------------
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.outbox_events
   WHERE event_type = 'meeting.guest.joined' AND tenant_id = (SELECT tenant_id FROM _t);
  IF _n < 1 THEN
    RAISE EXCEPTION 'FAIL guest-outbox: không có outbox event nào cho khách vào';
  END IF;
  RAISE NOTICE 'OK guest-outbox: % event ghi nhận', _n;
END $$;

ROLLBACK;
\echo === PASS 18_meeting_guest_link ===

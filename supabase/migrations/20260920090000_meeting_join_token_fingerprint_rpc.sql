-- ADR-1E-001 §2.5 — ghi vân tay (sha256 prefix) của token LiveKit vừa ký.
--
-- Trước đây bước này dùng service-role client ghi thẳng vào bảng domain, vi phạm
-- Blueprint §17 (admin client không được chạm bảng domain) và làm cả luồng "vào
-- phòng họp" hỏng khi SUPABASE_SERVICE_ROLE_KEY không có mặt ở runtime.
-- Thay bằng RPC: chỉ cho phép chủ sở hữu bản ghi thay 'pending' bằng vân tay thật.
CREATE OR REPLACE FUNCTION public.record_meeting_join_token_fingerprint(
  _meeting_id uuid,
  _token_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor   UUID := auth.uid();
  _updated INT;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF _token_fingerprint IS NULL OR length(_token_fingerprint) < 8 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: token_fingerprint' USING ERRCODE='22000';
  END IF;

  -- Chỉ vá đúng bản ghi 'pending' của chính người gọi; không phải PATCH tuỳ ý.
  UPDATE public.meeting_join_tokens
     SET token_fingerprint = _token_fingerprint
   WHERE meeting_id = _meeting_id
     AND user_id = _actor
     AND token_fingerprint = 'pending';
  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN jsonb_build_object('updated', _updated);
END;
$$;

REVOKE ALL ON FUNCTION public.record_meeting_join_token_fingerprint(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_meeting_join_token_fingerprint(uuid, text) TO authenticated, service_role;

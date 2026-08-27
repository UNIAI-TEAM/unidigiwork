-- WE-3 · Guard tích hợp: cô lập tổ chức cho số liệu kinh tế + chi phí thiếu không được quy về 0.
-- Chạy như các file khác trong tests/integration (xem scripts/integration-tests.sh).
\set ON_ERROR_STOP on
\i tests/integration/_helpers.sql

BEGIN;

-- 1) work_execution_costs phải bật RLS và KHÔNG có policy ghi từ client.
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'work_execution_costs' AND relrowsecurity
  ) THEN RAISE EXCEPTION 'FAIL: work_execution_costs chưa bật RLS'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'work_execution_costs'
     AND cmd IN ('INSERT','UPDATE','DELETE');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL: tồn tại % policy ghi trên work_execution_costs', n; END IF;
END $$;

-- 2) Bảng giá & chính sách chi phí người chỉ admin mới ghi được (không có policy cho anon).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('ai_model_cost_rates','human_cost_policies')
     AND 'anon' = ANY(roles);
  IF n > 0 THEN RAISE EXCEPTION 'FAIL: bảng giá đang mở cho anon'; END IF;
END $$;

-- 3) Tổng hợp kinh tế phải chặn tổ chức không phải thành viên (fail-closed).
DO $$
DECLARE other uuid; ok boolean := false;
BEGIN
  SELECT id INTO other FROM public.tenants ORDER BY created_at LIMIT 1;
  IF other IS NULL THEN RAISE NOTICE 'SKIP: chưa có tenant nào'; RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  BEGIN
    PERFORM public.work_product_economics('WU_ANY', 1, other);
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: work_product_economics không chặn người ngoài tổ chức'; END IF;
END $$;

-- 4) Chi phí thiếu phải là NULL + đánh dấu UNKNOWN, tuyệt đối không phải 0.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.work_execution_costs
   WHERE (ai_compute_status = 'UNKNOWN' AND ai_compute_cost IS NOT NULL)
      OR (human_cost_status = 'UNKNOWN' AND human_cost IS NOT NULL);
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL: % dòng chi phí UNKNOWN bị điền số', bad; END IF;

  SELECT count(*) INTO bad FROM public.work_execution_costs
   WHERE completeness = 'FULL' AND array_length(unknown_components, 1) IS NOT NULL;
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL: % dòng FULL nhưng vẫn còn thành phần chưa đo', bad; END IF;
END $$;

-- 5) Chi phí đã tính phải luôn ghim phiên bản bảng giá (tái tạo được lịch sử).
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.work_execution_costs
   WHERE ai_compute_status = 'MEASURED' AND (rate_version IS NULL OR rate_effective_at IS NULL);
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL: % dòng AI_COMPUTE thiếu rate_version/rate_effective_at', bad; END IF;
END $$;

ROLLBACK;

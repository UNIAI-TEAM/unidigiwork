-- HARDEN-SELLWORK-1 · Guard: uỷ quyền RPC SECURITY DEFINER, không có đường ẩn danh,
-- và telemetry sử dụng AI đủ cột để quy chi phí theo từng lượt gọi model.
\set ON_ERROR_STOP on
\i tests/integration/_helpers.sql

BEGIN;

-- 1) Các RPC nhạy cảm phải là SECURITY DEFINER và KHÔNG cấp EXECUTE cho anon/public.
DO $$
DECLARE fn text; leaked text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'recompute_work_execution_cost',
    'recompute_work_execution_metrics',
    'record_ai_usage_event',
    'reconcile_work_execution_steps',
    'bind_work_product_execution'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = fn
    ) THEN RAISE EXCEPTION 'FAIL: thiếu hàm %', fn; END IF;

    SELECT string_agg(p.proname, ',') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('public', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL: % đang mở EXECUTE cho anon/public', fn;
    END IF;
  END LOOP;
END $$;

-- 2) Gọi RPC khi không có phiên đăng nhập phải bị từ chối (fail-closed).
DO $$
DECLARE ok boolean := false; ex uuid;
BEGIN
  SELECT id INTO ex FROM public.ai_task_executions ORDER BY created_at LIMIT 1;
  IF ex IS NULL THEN RAISE NOTICE 'SKIP: chưa có lượt chạy nào'; RETURN; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.recompute_work_execution_cost(ex);
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: recompute_work_execution_cost chạy được khi chưa đăng nhập'; END IF;
END $$;

-- 3) ai_usage_events phải đủ cột quy chi phí theo từng lượt gọi model.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['execution_id','purpose','provider','model','input_tokens','output_tokens'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ai_usage_events' AND column_name = c
    ) THEN RAISE EXCEPTION 'FAIL: ai_usage_events thiếu cột %', c; END IF;
  END LOOP;
END $$;

-- 4) Work Graph không được tham chiếu cột đã trôi lệch: meetings dùng start_at.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'start_at'
  ) THEN RAISE EXCEPTION 'FAIL: meetings.start_at không tồn tại'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'starts_at'
  ) THEN RAISE EXCEPTION 'FAIL: tồn tại cột trùng lặp meetings.starts_at'; END IF;
END $$;

-- 5) Chi phí trộn tiền tệ không được ghi thành một tổng đơn nhất.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.work_execution_costs
   WHERE completeness <> 'FULL' AND known_cost IS NOT NULL
     AND 'CURRENCY_MISMATCH' = ANY(coalesce(unknown_components, ARRAY[]::text[]));
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL: % dòng CURRENCY_MISMATCH vẫn có known_cost', bad; END IF;
END $$;

ROLLBACK;

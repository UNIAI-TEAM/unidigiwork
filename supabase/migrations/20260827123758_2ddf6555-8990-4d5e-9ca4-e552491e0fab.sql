-- WE-2: preflight phải chặn cái sai thật sự, không chặn công việc hợp lệ chưa gắn dự án.
UPDATE public.work_units
SET input_contract = jsonb_set(input_contract, '{required}', '[]'::jsonb),
    executor_contract = jsonb_set(executor_contract, '{requiredRole}', 'null'::jsonb)
WHERE code IN ('WEEKLY_PROJECT_INTELLIGENCE', 'PROJECT_RISK_ANALYSIS') AND version = 1;
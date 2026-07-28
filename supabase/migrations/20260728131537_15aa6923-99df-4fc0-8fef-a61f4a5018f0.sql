-- Seed quota limits for 4 domain meters across all plans
-- Values per ADR-1D-001
INSERT INTO public.plan_features (plan_id, feature_key, enabled, quota_limit, updated_at)
SELECT p.id, v.feature_key, true, v.quota_limit, now()
FROM public.plans p
CROSS JOIN LATERAL (VALUES
  -- Free
  ('free','tasks.active', 100::bigint),
  ('free','documents.storage_bytes', 1073741824::bigint),           -- 1 GB
  ('free','meetings.scheduled_per_month', 20::bigint),
  ('free','workflows.runs_per_month', 100::bigint),
  -- Pro
  ('pro','tasks.active', 5000::bigint),
  ('pro','documents.storage_bytes', 53687091200::bigint),           -- 50 GB
  ('pro','meetings.scheduled_per_month', 500::bigint),
  ('pro','workflows.runs_per_month', 10000::bigint),
  -- Business (unlimited => NULL quota_limit)
  ('business','tasks.active', NULL::bigint),
  ('business','documents.storage_bytes', NULL::bigint),
  ('business','meetings.scheduled_per_month', NULL::bigint),
  ('business','workflows.runs_per_month', NULL::bigint)
) AS v(plan_code, feature_key, quota_limit)
WHERE p.code = v.plan_code
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    quota_limit = EXCLUDED.quota_limit,
    updated_at = now();

-- Refresh entitlements for all active tenants so changes take effect immediately
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE status = 'active' LOOP
    PERFORM public.refresh_entitlements(t.id);
  END LOOP;
END $$;
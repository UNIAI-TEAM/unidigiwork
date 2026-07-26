
-- =========================================================
-- Batch 0B.3: Deterministic workspace→tenant backfill
-- Idempotent. Uses tenant.id = workspace.id as stable mapping.
-- =========================================================

-- 1) Create one tenant per existing workspace
INSERT INTO public.tenants (id, slug, name, status, created_by, updated_by, created_at, updated_at)
SELECT
  w.id,
  -- deterministic slug: lowercased name, non-alnum → '-', truncated, suffix with short id
  regexp_replace(lower(w.name), '[^a-z0-9]+', '-', 'g') || '-' || substr(w.id::text, 1, 8),
  w.name,
  'active',
  w.owner_id,
  w.owner_id,
  w.created_at,
  now()
FROM public.workspaces w
ON CONFLICT (id) DO NOTHING;

-- 2) Tenant owner from workspace owner
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, created_by, updated_by)
SELECT w.id, w.owner_id, 'tenant_owner'::public.tenant_role, 'active'::public.tenant_member_status, w.owner_id, w.owner_id
FROM public.workspaces w
WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = w.owner_id)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 3) Remaining workspace members as tenant members
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, created_by, updated_by)
SELECT
  wm.workspace_id,
  wm.user_id,
  CASE
    WHEN wm.role = 'owner' THEN 'tenant_owner'::public.tenant_role
    ELSE 'member'::public.tenant_role
  END,
  'active'::public.tenant_member_status,
  wm.user_id,
  wm.user_id
FROM public.workspace_members wm
WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = wm.user_id)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

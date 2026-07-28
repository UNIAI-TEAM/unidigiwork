-- 00_schema_invariants.sql
-- Post-migration verification: RLS, GRANTs, triggers, indexes, quota meters.
-- Wrapped in BEGIN/ROLLBACK by scripts/integration-tests.sh.
-- Every DO block raises on mismatch to fail the test.
\set ON_ERROR_STOP on

-- ---- 1) RLS enabled on every tenant-scoped / user-facing public table -----
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO _bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relrowsecurity = false
    AND c.relname = ANY (ARRAY[
      'tenants','tenant_members','tenant_invitations','workspaces','workspace_members',
      'user_roles','profiles','users','external_identities',
      'tasks','task_assignees','task_comments',
      'documents','document_versions','document_permissions',
      'meetings','meeting_participants',
      'workflows','workflow_runs','workflow_steps',
      'email_threads','email_messages','email_states',
      'notifications','notification_preferences',
      'subscriptions','entitlements','usage_events','usage_counters',
      'plans','plan_features','features',
      'audit_events','outbox_events','admin_rules'
    ]);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL rls: tables without RLS: %', _bad;
  END IF;
  RAISE NOTICE 'PASS rls: all required tables have RLS enabled';
END $$;

-- ---- 2) Every RLS-enabled public table has at least one policy ------------
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO _bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
    AND c.relname <> 'outbox_events'  -- intentionally locked; accessed only via SECURITY DEFINER RPCs
  GROUP BY c.relname
  HAVING count(p.polname) = 0;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL policy: RLS on but zero policies: %', _bad;
  END IF;
  RAISE NOTICE 'PASS policy: every RLS-enabled table has >=1 policy';
END $$;

-- ---- 3) GRANTs on new business-domain tables to expected roles ------------
DO $$
DECLARE _bad text;
BEGIN
  WITH required(tbl, role, priv) AS (VALUES
    ('tasks','authenticated','SELECT'),('tasks','authenticated','INSERT'),
    ('tasks','authenticated','UPDATE'),('tasks','authenticated','DELETE'),
    ('tasks','service_role','SELECT'),
    ('task_assignees','authenticated','SELECT'),('task_assignees','service_role','SELECT'),
    ('task_comments','authenticated','SELECT'),('task_comments','service_role','SELECT'),
    ('documents','authenticated','SELECT'),('documents','service_role','SELECT'),
    ('document_versions','authenticated','SELECT'),('document_versions','service_role','SELECT'),
    ('document_permissions','authenticated','SELECT'),('document_permissions','service_role','SELECT'),
    ('meetings','authenticated','SELECT'),('meetings','service_role','SELECT'),
    ('meeting_participants','authenticated','SELECT'),('meeting_participants','service_role','SELECT'),
    ('workflows','authenticated','SELECT'),('workflows','service_role','SELECT'),
    ('workflow_runs','authenticated','SELECT'),('workflow_runs','service_role','SELECT'),
    ('workflow_steps','authenticated','SELECT'),('workflow_steps','service_role','SELECT')
  )
  SELECT string_agg(r.tbl || ':' || r.role || ':' || r.priv, ', ') INTO _bad
  FROM required r
  WHERE NOT has_table_privilege(r.role, ('public.' || r.tbl)::regclass, r.priv);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL grants missing: %', _bad;
  END IF;
  RAISE NOTICE 'PASS grants: all required table grants present';
END $$;

-- ---- 4) tg_*_fill_tenant triggers wired on every tenant-derived table -----
DO $$
DECLARE _bad text;
BEGIN
  WITH required(tbl, fn) AS (VALUES
    ('tasks','tg_tasks_fill_tenant'),
    ('task_assignees','tg_task_children_fill_tenant'),
    ('task_comments','tg_task_children_fill_tenant'),
    ('documents','tg_documents_fill_tenant'),
    ('document_versions','tg_document_children_fill_tenant'),
    ('document_permissions','tg_document_children_fill_tenant'),
    ('meetings','tg_meetings_fill_tenant'),
    ('meeting_participants','tg_meeting_participants_fill_tenant'),
    ('workflows','tg_workflows_fill_tenant'),
    ('workflow_runs','tg_workflow_runs_fill_tenant'),
    ('workflow_steps','tg_workflow_steps_fill_tenant'),
    ('workspaces','tg_workspaces_fill_tenant'),
    ('email_threads','tg_email_threads_fill_tenant'),
    ('email_messages','tg_email_messages_fill_tenant'),
    ('email_states','tg_email_states_fill_tenant'),
    ('notifications','tg_notifications_fill_tenant')
  )
  SELECT string_agg(r.tbl || '→' || r.fn, ', ') INTO _bad
  FROM required r
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname = r.tbl
      AND p.proname = r.fn AND NOT t.tgisinternal
  );
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL fill_tenant triggers missing: %', _bad;
  END IF;
  RAISE NOTICE 'PASS fill_tenant: all tenant-derived tables have fill trigger';
END $$;

-- ---- 5) bump_row_version trigger on every table with row_version column ---
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO _bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='row_version' AND a.attnum > 0
  WHERE n.nspname='public' AND c.relkind='r'
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=c.oid AND p.proname='bump_row_version' AND NOT t.tgisinternal
    );
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL bump_row_version missing on: %', _bad;
  END IF;
  RAISE NOTICE 'PASS bump_row_version: trigger present on every row_version table';
END $$;

-- ---- 6) Critical indexes exist -------------------------------------------
DO $$
DECLARE _bad text;
BEGIN
  WITH required(tbl, cols) AS (VALUES
    ('tasks','tenant_id'),('tasks','workspace_id'),
    ('task_assignees','user_id'),
    ('documents','tenant_id'),('documents','workspace_id'),
    ('document_versions','document_id'),
    ('document_permissions','principal_id'),
    ('meetings','tenant_id'),('meetings','start_at'),
    ('meeting_participants','user_id'),
    ('workflows','tenant_id'),
    ('workflow_runs','workflow_id'),
    ('workflow_steps','run_id'),
    ('usage_counters','tenant_id'),
    ('usage_events','tenant_id'),
    ('outbox_events','status'),
    ('audit_events','tenant_id')
  )
  SELECT string_agg(r.tbl || '(' || r.cols || ')', ', ') INTO _bad
  FROM required r
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname='public' AND i.tablename=r.tbl
      AND i.indexdef ILIKE '%(' || r.cols || '%'
  );
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL indexes missing: %', _bad;
  END IF;
  RAISE NOTICE 'PASS indexes: all required indexes present';
END $$;

-- ---- 7) Quota meters seeded in features + mapped in plan_features --------
DO $$
DECLARE _bad text; _n int;
BEGIN
  SELECT string_agg(k, ', ') INTO _bad
  FROM unnest(ARRAY[
    'tasks.active',
    'documents.storage_bytes',
    'meetings.scheduled_per_month',
    'workflows.active',
    'member.count',
    'workspace.count'
  ]) AS k
  WHERE NOT EXISTS (SELECT 1 FROM public.features f WHERE f.key = k);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL features registry missing meters: %', _bad;
  END IF;

  SELECT string_agg(k, ', ') INTO _bad
  FROM unnest(ARRAY[
    'tasks.active','documents.storage_bytes','meetings.scheduled_per_month','workflows.active'
  ]) AS k
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_features pf
    JOIN public.plans p ON p.id = pf.plan_id AND p.is_default = true
    WHERE pf.feature_key = k
  );
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL default plan missing meter mappings: %', _bad;
  END IF;

  SELECT count(*) INTO _n FROM public.plans WHERE is_default = true AND is_active = true;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL default plan: expected exactly 1 active default, got %', _n;
  END IF;
  RAISE NOTICE 'PASS quota meters: features + default plan mappings complete';
END $$;

-- ---- 8) Immutability triggers on append-only tables ----------------------
DO $$
DECLARE _bad text;
BEGIN
  WITH required(tbl, fn) AS (VALUES
    ('audit_events','tg_audit_events_immutable'),
    ('usage_events','tg_usage_events_immutable'),
    ('document_versions','tg_document_versions_immutable')
  )
  SELECT string_agg(r.tbl, ', ') INTO _bad
  FROM required r
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=r.tbl AND p.proname=r.fn AND NOT t.tgisinternal
  );
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL immutability triggers missing on: %', _bad;
  END IF;
  RAISE NOTICE 'PASS immutability: append-only triggers present';
END $$;

SELECT 'schema_invariants OK' AS result;
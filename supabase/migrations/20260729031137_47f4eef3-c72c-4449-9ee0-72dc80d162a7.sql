CREATE OR REPLACE FUNCTION public._test_purge_tenant(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Order matters: child tables first for FKs that are NO ACTION.
  DELETE FROM public.task_comments      WHERE tenant_id = _tenant_id;
  DELETE FROM public.task_assignees     WHERE tenant_id = _tenant_id;
  DELETE FROM public.tasks              WHERE tenant_id = _tenant_id;
  DELETE FROM public.document_versions  WHERE tenant_id = _tenant_id;
  DELETE FROM public.document_permissions WHERE tenant_id = _tenant_id;
  DELETE FROM public.documents          WHERE tenant_id = _tenant_id;
  DELETE FROM public.meeting_participants WHERE tenant_id = _tenant_id;
  DELETE FROM public.meetings           WHERE tenant_id = _tenant_id;
  DELETE FROM public.workflow_steps     WHERE tenant_id = _tenant_id;
  DELETE FROM public.workflow_runs      WHERE tenant_id = _tenant_id;
  DELETE FROM public.workflows          WHERE tenant_id = _tenant_id;
  DELETE FROM public.email_states       WHERE tenant_id = _tenant_id;
  DELETE FROM public.email_messages     WHERE tenant_id = _tenant_id;
  DELETE FROM public.email_threads      WHERE tenant_id = _tenant_id;
  DELETE FROM public.notifications      WHERE tenant_id = _tenant_id;
  DELETE FROM public.audit_events       WHERE tenant_id = _tenant_id;
  DELETE FROM public.outbox_events      WHERE tenant_id = _tenant_id;
  DELETE FROM public.usage_events       WHERE tenant_id = _tenant_id;
  DELETE FROM public.usage_counters     WHERE tenant_id = _tenant_id;
  DELETE FROM public.entitlements       WHERE tenant_id = _tenant_id;
  DELETE FROM public.subscriptions      WHERE tenant_id = _tenant_id;
  DELETE FROM public.tenant_invitations WHERE tenant_id = _tenant_id;
  DELETE FROM public.workspace_members  WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE tenant_id = _tenant_id);
  DELETE FROM public.workspaces         WHERE tenant_id = _tenant_id;
  DELETE FROM public.tenant_members     WHERE tenant_id = _tenant_id;
  DELETE FROM public.tenants            WHERE id = _tenant_id;
END $$;

REVOKE ALL ON FUNCTION public._test_purge_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._test_purge_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._test_purge_tenant(uuid) TO authenticated;

-- =========================================================
-- Batch 0B.6: Tenant-aware RLS policies (additive)
-- Old workspace-only policies kept for compatibility.
-- =========================================================

-- ---- WORKSPACES ----
CREATE POLICY "workspaces_tenant_member_select" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- ---- DOCUMENTS ----
CREATE POLICY "documents_tenant_select" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "documents_tenant_write" ON public.documents
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.tenant_id = documents.tenant_id
    )
  );

-- ---- EMAIL_THREADS ----
CREATE POLICY "email_threads_tenant_select" ON public.email_threads
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "email_threads_tenant_write" ON public.email_threads
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.tenant_id = email_threads.tenant_id
    )
  );

-- ---- EMAIL_MESSAGES ----
CREATE POLICY "email_messages_tenant_select" ON public.email_messages
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "email_messages_tenant_write" ON public.email_messages
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.email_threads t
      WHERE t.id = thread_id AND t.tenant_id = email_messages.tenant_id
    )
  );

-- ---- EMAIL_STATES ----
CREATE POLICY "email_states_tenant_select" ON public.email_states
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) AND user_id = auth.uid());

CREATE POLICY "email_states_tenant_write" ON public.email_states
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id) AND user_id = auth.uid())
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.email_messages m
      WHERE m.id = message_id AND m.tenant_id = email_states.tenant_id
    )
  );

-- ---- NOTIFICATIONS (tenant-scoped ones must belong to member's tenant) ----
CREATE POLICY "notifications_tenant_scope" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      scope_type <> 'tenant'
      OR (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id))
    )
  );

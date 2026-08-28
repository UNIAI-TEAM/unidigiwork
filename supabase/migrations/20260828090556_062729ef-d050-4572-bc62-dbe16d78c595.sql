-- Gate 3/24 — chặn rò rỉ PII cho mọi tài khoản đã đăng nhập.
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "profiles_select_self_or_same_tenant"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.tenant_members me
    JOIN public.tenant_members other ON other.tenant_id = me.tenant_id
    WHERE me.user_id = auth.uid() AND other.user_id = public.profiles.id
  )
);

DROP POLICY IF EXISTS "authenticated_can_read_demo_requests" ON public.demo_requests;
CREATE POLICY "demo_requests_select_admin_only"
ON public.demo_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE OR REPLACE FUNCTION public.school_pending_invites(_tenant_id uuid)
RETURNS TABLE(id uuid, email text, role text, department text, status text, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public._school_is_bgh(_tenant_id, auth.uid()) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  RETURN QUERY SELECT i.id, i.email::text, i.role::text, i.department, i.status, i.expires_at
    FROM public.tenant_invitations i
    WHERE i.tenant_id=_tenant_id AND i.status='pending' AND i.expires_at > now()
    ORDER BY i.created_at DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.school_pending_invites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_pending_invites(uuid) TO authenticated, service_role;
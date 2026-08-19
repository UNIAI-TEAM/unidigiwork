REVOKE EXECUTE ON FUNCTION public.can_manage_document_shares(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_document_share(uuid, text, uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_manage_document_shares(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_document_share(uuid, text, uuid, text, text) TO authenticated;
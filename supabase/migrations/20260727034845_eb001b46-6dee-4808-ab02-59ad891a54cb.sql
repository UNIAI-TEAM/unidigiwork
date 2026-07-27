REVOKE ALL ON FUNCTION public.provision_tenant(text,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,uuid,text,text,text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
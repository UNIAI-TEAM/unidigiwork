REVOKE ALL ON FUNCTION public.record_ai_usage_event(uuid,text,text,integer,integer,text,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_work_execution_steps(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.split_ai_model_identity(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ai_usage_event(uuid,text,text,integer,integer,text,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_work_execution_steps(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.split_ai_model_identity(text) TO authenticated, service_role;
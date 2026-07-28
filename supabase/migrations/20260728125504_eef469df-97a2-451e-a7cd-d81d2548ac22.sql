
REVOKE EXECUTE ON FUNCTION public._emit_outbox_event(uuid,text,text,text,jsonb,text,text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._resolve_workspace_tenant(uuid) FROM authenticated, anon, PUBLIC;

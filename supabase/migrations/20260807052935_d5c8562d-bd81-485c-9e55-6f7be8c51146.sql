DO $do$
DECLARE
  r record;
  spec jsonb := jsonb_build_array(
    jsonb_build_object('fn','update_workflow','anchor','TENANT_ACCESS_DENIED'' USING ERRCODE=''42501''; END IF;','ws','_wf.workspace_id','action','edit'),
    jsonb_build_object('fn','publish_workflow','anchor','TENANT_ACCESS_DENIED'' USING ERRCODE=''42501''; END IF;','ws','_wf.workspace_id','action','publish'),
    jsonb_build_object('fn','start_workflow_run','anchor','TENANT_ACCESS_DENIED'' USING ERRCODE=''42501''; END IF;','ws','_wf.workspace_id','action','run'),
    jsonb_build_object('fn','simulate_workflow_run','anchor','TENANT_ACCESS_DENIED'' USING ERRCODE=''42501''; END IF;','ws','_wf.workspace_id','action','run'),
    jsonb_build_object('fn','upsert_workflow_trigger','anchor','TENANT_ACCESS_DENIED'' USING ERRCODE=''42501''; END IF;','ws','_wf.workspace_id','action','edit'),
    jsonb_build_object('fn','delete_workflow_trigger','anchor','TENANT_ACCESS_DENIED'' USING ERRCODE=''42501''; END IF;','ws','_t.workspace_id','action','edit'),
    jsonb_build_object('fn','create_workflow','anchor','_tenant := public._resolve_workspace_tenant(_workspace_id);','ws','_workspace_id','action','edit'),
    jsonb_build_object('fn','retry_workflow_run','anchor','SELECT * INTO _wf FROM public.workflows WHERE id = _src.workflow_id AND deleted_at IS NULL;','ws','_wf.workspace_id','action','run')
  );
  s jsonb; src text; guard text; newsrc text;
BEGIN
  FOR s IN SELECT * FROM jsonb_array_elements(spec) LOOP
    FOR r IN
      SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosrc,
             pg_get_function_result(p.oid) AS res,
             array_to_string(coalesce(p.proconfig,'{}'::text[]), ' ') AS cfg,
             p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = (s->>'fn')
    LOOP
      src := r.prosrc;
      IF position('has_workflow_permission' in src) > 0 THEN CONTINUE; END IF;
      IF position((s->>'anchor') in src) = 0 THEN
        RAISE EXCEPTION 'anchor not found in %', r.sig;
      END IF;
      guard := format($g$
  IF NOT public.has_workflow_permission(%s, auth.uid(), %L) THEN
    RAISE EXCEPTION %L USING ERRCODE='42501';
  END IF;$g$, s->>'ws', s->>'action', 'WORKFLOW_' || upper(s->>'action') || '_DENIED');
      newsrc := replace(src, s->>'anchor', (s->>'anchor') || guard);
      EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER %s AS $fnbody$%s$fnbody$',
        r.proname, r.args, r.res,
        CASE WHEN r.cfg <> '' THEN 'SET search_path = public' ELSE '' END, newsrc);
    END LOOP;
  END LOOP;
END $do$;
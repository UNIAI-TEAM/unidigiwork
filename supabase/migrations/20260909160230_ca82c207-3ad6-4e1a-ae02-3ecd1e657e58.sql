CREATE OR REPLACE FUNCTION public.rebuild_tenant_work_graph(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nodes_before integer;
  edges_before integer;
  nodes_after integer;
  edges_after integer;
  r record;
BEGIN
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner'::tenant_role)
          OR public.has_tenant_role(_tenant_id, 'tenant_admin'::tenant_role)) THEN
    RAISE EXCEPTION 'WORK_GRAPH_REBUILD_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO nodes_before FROM public.work_nodes WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO edges_before FROM public.work_edges WHERE tenant_id = _tenant_id;

  PERFORM public._rebuild_tenant_work_graph_core(_tenant_id);

  SELECT count(*) INTO nodes_after FROM public.work_nodes WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO edges_after FROM public.work_edges WHERE tenant_id = _tenant_id;

  RETURN jsonb_build_object(
    'nodesBefore', nodes_before,
    'edgesBefore', edges_before,
    'nodesAfter', nodes_after,
    'edgesAfter', edges_after,
    'nodesAdded', nodes_after - nodes_before,
    'edgesAdded', edges_after - edges_before
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._rebuild_tenant_work_graph_core(_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  SELECT _tenant_id, 'WORKSPACE', w.id FROM public.workspaces w WHERE w.tenant_id = _tenant_id
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  SELECT _tenant_id, 'TASK', t.id FROM public.tasks t WHERE t.tenant_id = _tenant_id
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  SELECT _tenant_id, 'MEETING', m.id FROM public.meetings m WHERE m.tenant_id = _tenant_id
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  SELECT _tenant_id, 'MEETING_ARTIFACT', a.id FROM public.meeting_artifacts a WHERE a.tenant_id = _tenant_id
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  SELECT _tenant_id, 'DOCUMENT', d.id FROM public.documents d WHERE d.tenant_id = _tenant_id
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  SELECT _tenant_id, 'WORK_PRODUCT', p.id FROM public.work_products p
   WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  FOR r IN
    SELECT 'TASK'::text AS et, t.id, t.workspace_id FROM public.tasks t
     WHERE t.tenant_id = _tenant_id AND t.workspace_id IS NOT NULL
    UNION ALL
    SELECT 'MEETING', m.id, m.workspace_id FROM public.meetings m
     WHERE m.tenant_id = _tenant_id AND m.workspace_id IS NOT NULL
    UNION ALL
    SELECT 'MEETING_ARTIFACT', a.id, a.workspace_id FROM public.meeting_artifacts a
     WHERE a.tenant_id = _tenant_id AND a.workspace_id IS NOT NULL
    UNION ALL
    SELECT 'DOCUMENT', d.id, d.workspace_id FROM public.documents d
     WHERE d.tenant_id = _tenant_id AND d.workspace_id IS NOT NULL
    UNION ALL
    SELECT 'WORK_PRODUCT', p.id, p.workspace_id FROM public.work_products p
     WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL AND p.workspace_id IS NOT NULL
  LOOP
    PERFORM public._work_graph_link_system(r.et, r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
  END LOOP;

  FOR r IN
    SELECT t.id, t.parent_task_id FROM public.tasks t
     WHERE t.tenant_id = _tenant_id AND t.parent_task_id IS NOT NULL
  LOOP
    PERFORM public._work_graph_link_system('TASK', r.id, 'TASK', r.parent_task_id, 'BELONGS_TO');
  END LOOP;

  FOR r IN
    SELECT a.id, a.meeting_id FROM public.meeting_artifacts a
     WHERE a.tenant_id = _tenant_id AND a.meeting_id IS NOT NULL
  LOOP
    PERFORM public._work_graph_link_system('MEETING', r.meeting_id, 'MEETING_ARTIFACT', r.id, 'GENERATES');
  END LOOP;

  -- Kết quả công việc gắn với ngữ cảnh chính đã khai báo
  FOR r IN
    SELECT p.id, p.primary_context_type AS ctx_type, p.primary_context_id AS ctx_id
      FROM public.work_products p
     WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
       AND p.primary_context_id IS NOT NULL
       AND p.primary_context_type IN ('TASK','MEETING','MEETING_ARTIFACT','DOCUMENT','PROJECT','WORKSPACE')
  LOOP
    PERFORM public._work_graph_link_system('WORK_PRODUCT', r.id, r.ctx_type, r.ctx_id, 'REFERENCES');
  END LOOP;

  -- Nguồn ngữ cảnh AI đã dùng cho từng phiên bản (provenance thật)
  FOR r IN
    SELECT DISTINCT v.work_product_id AS id,
           (src->>'type') AS ctx_type,
           (src->>'id')::uuid AS ctx_id
      FROM public.work_product_versions v
      JOIN public.work_products p ON p.id = v.work_product_id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(v.provenance) = 'array' THEN v.provenance ELSE '[]'::jsonb END
      ) AS src
     WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
       AND (src->>'id') ~ '^[0-9a-fA-F-]{36}$'
       AND (src->>'type') IN ('TASK','MEETING','MEETING_ARTIFACT','DOCUMENT')
  LOOP
    PERFORM public._work_graph_link_system('WORK_PRODUCT', r.id, r.ctx_type, r.ctx_id, 'REFERENCES');
  END LOOP;
END;
$function$;

-- Dựng lại bản đồ cho mọi tổ chức hiện có bằng dữ liệu thật
DO $$
DECLARE t uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public._rebuild_tenant_work_graph_core(t);
  END LOOP;
END $$;
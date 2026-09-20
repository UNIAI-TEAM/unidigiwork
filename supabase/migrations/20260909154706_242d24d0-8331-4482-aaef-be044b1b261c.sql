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

  -- Điểm nút cho mọi thực thể chính của tổ chức
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
  SELECT _tenant_id, 'WORK_PRODUCT', p.id FROM public.work_products p WHERE p.tenant_id = _tenant_id
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  -- Quan hệ hệ thống: thuộc về không gian làm việc
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
  LOOP
    PERFORM public._work_graph_link_system(r.et, r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
  END LOOP;

  -- Công việc con thuộc công việc cha
  FOR r IN
    SELECT t.id, t.parent_task_id FROM public.tasks t
     WHERE t.tenant_id = _tenant_id AND t.parent_task_id IS NOT NULL
  LOOP
    PERFORM public._work_graph_link_system('TASK', r.id, 'TASK', r.parent_task_id, 'BELONGS_TO');
  END LOOP;

  -- Cuộc họp sinh ra biên bản / quyết định
  FOR r IN
    SELECT a.id, a.meeting_id FROM public.meeting_artifacts a
     WHERE a.tenant_id = _tenant_id AND a.meeting_id IS NOT NULL
  LOOP
    PERFORM public._work_graph_link_system('MEETING', r.meeting_id, 'MEETING_ARTIFACT', r.id, 'GENERATES');
  END LOOP;

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

REVOKE ALL ON FUNCTION public.rebuild_tenant_work_graph(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_tenant_work_graph(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_work_graph_stats(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'WORK_GRAPH_STATS_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'nodes', (SELECT count(*) FROM public.work_nodes WHERE tenant_id = _tenant_id),
    'edges', (SELECT count(*) FROM public.work_edges WHERE tenant_id = _tenant_id),
    'nodesByType', COALESCE((
      SELECT jsonb_object_agg(entity_type, c)
        FROM (SELECT entity_type, count(*) c FROM public.work_nodes
               WHERE tenant_id = _tenant_id GROUP BY entity_type) s), '{}'::jsonb),
    'edgesByType', COALESCE((
      SELECT jsonb_object_agg(relationship_type, c)
        FROM (SELECT relationship_type, count(*) c FROM public.work_edges
               WHERE tenant_id = _tenant_id GROUP BY relationship_type) s), '{}'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_work_graph_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_work_graph_stats(uuid) TO authenticated, service_role;
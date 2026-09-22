CREATE OR REPLACE FUNCTION public.list_work_graph_board_page(
  _tenant_id uuid,
  _tab text DEFAULT 'all',
  _search text DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _due_filter text DEFAULT 'all',
  _task_id uuid DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH source_rows AS (
  SELECT n.id node_id, n.entity_type, n.entity_id, t.title, t.status::text status,
    GREATEST(n.updated_at, t.updated_at) updated_at, t.due_at,
    (SELECT ta.user_id FROM public.task_assignees ta WHERE ta.task_id=t.id ORDER BY (ta.role='owner') DESC, ta.assigned_at, ta.user_id LIMIT 1) owner_id,
    COALESCE((n.metadata->>'progress')::integer, CASE t.status::text WHEN 'done' THEN 100 WHEN 'canceled' THEN 100 WHEN 'in_progress' THEN 50 WHEN 'blocked' THEN 35 ELSE 5 END) progress,
    COALESCE((n.metadata->>'completed_steps')::integer,0) completed_steps,
    COALESCE((n.metadata->>'total_steps')::integer,0) total_steps
  FROM public.work_nodes n JOIN public.tasks t ON n.entity_type='TASK' AND t.id=n.entity_id
  WHERE n.tenant_id=_tenant_id AND t.tenant_id=_tenant_id AND t.deleted_at IS NULL
  UNION ALL
  SELECT n.id,n.entity_type,n.entity_id,wp.title,wp.status,GREATEST(n.updated_at,wp.updated_at),NULL::timestamptz,wp.owner_id,
    CASE wp.status WHEN 'ACCEPTED' THEN 100 WHEN 'DELIVERED' THEN 100 WHEN 'IN_REVIEW' THEN 70 WHEN 'DRAFT' THEN 25 ELSE 10 END,0,0
  FROM public.work_nodes n JOIN public.work_products wp ON n.entity_type='WORK_PRODUCT' AND wp.id=n.entity_id
  WHERE n.tenant_id=_tenant_id AND wp.tenant_id=_tenant_id AND wp.deleted_at IS NULL
  UNION ALL
  SELECT n.id,n.entity_type,n.entity_id,'Lượt thực thi #'||COALESCE(e.revision::text,'?'),e.status,GREATEST(n.updated_at,e.updated_at),NULL::timestamptz,NULL::uuid,
    CASE e.status WHEN 'ACCEPTED' THEN 100 WHEN 'SUCCEEDED' THEN 100 WHEN 'FAILED' THEN 100 WHEN 'WAITING_REVIEW' THEN 85 WHEN 'CHANGES_REQUESTED' THEN 70 WHEN 'RUNNING' THEN 50 ELSE 10 END,
    COALESCE(es.completed_steps,0)::integer,COALESCE(es.total_steps,0)::integer
  FROM public.work_nodes n JOIN public.ai_task_executions e ON n.entity_type='EXECUTION' AND e.id=n.entity_id
  LEFT JOIN LATERAL (SELECT count(*) total_steps,count(*) FILTER(WHERE upper(s.status) IN ('SUCCEEDED','DONE','COMPLETED','SKIPPED')) completed_steps FROM public.work_execution_steps s WHERE s.execution_id=e.id) es ON true
  WHERE n.tenant_id=_tenant_id AND e.tenant_id=_tenant_id
), filtered AS (
 SELECT s.* FROM source_rows s WHERE
 (_task_id IS NULL OR (s.entity_type='TASK' AND s.entity_id=_task_id))
 AND (NULLIF(btrim(_search),'') IS NULL OR s.title ILIKE '%'||replace(replace(btrim(_search),'%',''),'_','')||'%')
 AND ((_assignee_id IS NULL AND NOT _unassigned) OR (_assignee_id IS NOT NULL AND s.owner_id=_assignee_id) OR (_unassigned AND s.entity_type IN ('TASK','WORK_PRODUCT') AND s.owner_id IS NULL))
 AND CASE _due_filter
  WHEN 'overdue' THEN s.entity_type='TASK' AND s.due_at<now() AND lower(COALESCE(s.status,'')) NOT IN ('done','canceled')
  WHEN 'due_soon' THEN s.entity_type='TASK' AND s.due_at>=now() AND s.due_at<now()+interval '24 hours' AND lower(COALESCE(s.status,'')) NOT IN ('done','canceled')
  WHEN 'scheduled' THEN s.entity_type='TASK' AND s.due_at>=now()+interval '24 hours' AND lower(COALESCE(s.status,'')) NOT IN ('done','canceled')
  WHEN 'none' THEN s.entity_type='TASK' AND s.due_at IS NULL ELSE true END
), categorized AS (
 SELECT f.*,
 CASE WHEN f.entity_type='EXECUTION' THEN f.status IN ('QUEUED','RUNNING','WAITING_REVIEW','CHANGES_REQUESTED') WHEN f.entity_type='TASK' THEN lower(COALESCE(f.status,'')) IN ('in_progress','blocked') ELSE f.status='IN_REVIEW' END is_running,
 CASE WHEN f.entity_type='EXECUTION' THEN f.status IN ('ACCEPTED','SUCCEEDED') WHEN f.entity_type='TASK' THEN lower(COALESCE(f.status,''))='done' ELSE f.status IN ('ACCEPTED','DELIVERED') END is_done
 FROM filtered f
), counts AS (
 SELECT count(*)::integer all_count,count(*) FILTER(WHERE is_running)::integer running_count,count(*) FILTER(WHERE is_done)::integer done_count,count(*) FILTER(WHERE entity_type='WORK_PRODUCT')::integer products_count FROM categorized
), tabbed AS (
 SELECT c.* FROM categorized c WHERE CASE _tab WHEN 'running' THEN c.is_running WHEN 'done' THEN c.is_done WHEN 'products' THEN c.entity_type='WORK_PRODUCT' ELSE true END
), total AS (SELECT count(*)::integer value FROM tabbed),
page_rows AS (SELECT t.* FROM tabbed t ORDER BY t.updated_at DESC,t.entity_type,t.entity_id LIMIT LEAST(GREATEST(COALESCE(_limit,25),10),100) OFFSET GREATEST(COALESCE(_offset,0),0)),
enriched AS (SELECT p.*,(SELECT count(*)::integer FROM public.work_edges e WHERE e.tenant_id=_tenant_id AND (e.source_node_id=p.node_id OR e.target_node_id=p.node_id)) links FROM page_rows p)
SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.updated_at DESC,e.entity_type,e.entity_id) FROM enriched e),'[]'::jsonb),'total',(SELECT value FROM total),'counts',jsonb_build_object('all',(SELECT all_count FROM counts),'running',(SELECT running_count FROM counts),'done',(SELECT done_count FROM counts),'products',(SELECT products_count FROM counts)))
$$;

REVOKE ALL ON FUNCTION public.list_work_graph_board_page(uuid,text,text,uuid,boolean,text,uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_work_graph_board_page(uuid,text,text,uuid,boolean,text,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_work_graph_board_page(uuid,text,text,uuid,boolean,text,uuid,integer,integer) TO service_role;
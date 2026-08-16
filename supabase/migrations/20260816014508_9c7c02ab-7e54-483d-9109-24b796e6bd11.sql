-- ============================================================
-- WORK GRAPH FOUNDATION V1
-- ============================================================

-- 1) Relationship registry ------------------------------------------------
CREATE TABLE public.work_relationship_types (
  code text NOT NULL,
  source_type text NOT NULL,
  target_type text NOT NULL,
  user_creatable boolean NOT NULL DEFAULT false,
  system_creatable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, source_type, target_type)
);
GRANT SELECT ON public.work_relationship_types TO authenticated;
GRANT ALL ON public.work_relationship_types TO service_role;
ALTER TABLE public.work_relationship_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registry readable by authenticated"
  ON public.work_relationship_types FOR SELECT TO authenticated USING (true);

INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable) VALUES
  ('BELONGS_TO','TASK','WORKSPACE',false),
  ('BELONGS_TO','TASK','TASK',false),
  ('BELONGS_TO','MEETING','WORKSPACE',false),
  ('BELONGS_TO','DOCUMENT','WORKSPACE',false),
  ('BELONGS_TO','EMAIL','WORKSPACE',false),
  ('BELONGS_TO','CHAT_CHANNEL','WORKSPACE',false),
  ('ASSIGNED_TO','TASK','PERSON',false),
  ('PARTICIPATED_IN','PERSON','MEETING',false),
  ('DISCUSSES','MEETING','WORKSPACE',true),
  ('DISCUSSES','MEETING','TASK',true),
  ('GENERATES','MEETING','TASK',false),
  ('GENERATES','MEETING','DOCUMENT',false),
  ('GENERATES','EMAIL','TASK',false),
  ('ATTACHED_TO','DOCUMENT','WORKSPACE',true),
  ('ATTACHED_TO','DOCUMENT','TASK',true),
  ('ATTACHED_TO','DOCUMENT','MEETING',true),
  ('REFERENCES','EMAIL','WORKSPACE',true),
  ('REFERENCES','EMAIL','TASK',true),
  ('REFERENCES','EMAIL','MEETING',true),
  ('REFERENCES','EMAIL','DOCUMENT',true),
  ('REFERENCES','TASK','DOCUMENT',true),
  ('REFERENCES','TASK','EMAIL',true),
  ('REFERENCES','TASK','MEETING',true),
  ('BLOCKS','TASK','TASK',true),
  ('DEPENDS_ON','TASK','TASK',true),
  ('FOLLOWS_UP','TASK','MEETING',true),
  ('RELATED_TO','TASK','TASK',true),
  ('RELATED_TO','TASK','WORKSPACE',true),
  ('RELATED_TO','TASK','CHAT_CHANNEL',true),
  ('RELATED_TO','WORKSPACE','CHAT_CHANNEL',true),
  ('RELATED_TO','WORKSPACE','DOCUMENT',true),
  ('RELATED_TO','WORKSPACE','MEETING',true),
  ('RELATED_TO','MEETING','DOCUMENT',true),
  ('RELATED_TO','DOCUMENT','DOCUMENT',true),
  ('SHARED_IN','DOCUMENT','CHAT_CHANNEL',true);

-- 2) Nodes ---------------------------------------------------------------
CREATE TABLE public.work_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN
    ('TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL','DOCUMENT','EMAIL')),
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE INDEX work_nodes_tenant_type_entity_idx ON public.work_nodes (tenant_id, entity_type, entity_id);
CREATE INDEX work_nodes_workspace_idx ON public.work_nodes (workspace_id) WHERE workspace_id IS NOT NULL;

-- 3) Edges ---------------------------------------------------------------
CREATE TABLE public.work_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  source_node_id uuid NOT NULL REFERENCES public.work_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.work_nodes(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  origin text NOT NULL DEFAULT 'SYSTEM' CHECK (origin IN ('SYSTEM','USER','AI_SUGGESTED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_node_id <> target_node_id),
  UNIQUE (tenant_id, source_node_id, target_node_id, relationship_type)
);
CREATE INDEX work_edges_source_idx ON public.work_edges (tenant_id, source_node_id);
CREATE INDEX work_edges_target_idx ON public.work_edges (tenant_id, target_node_id);
CREATE INDEX work_edges_rel_idx ON public.work_edges (tenant_id, relationship_type);

-- 4) Visibility helper (SECURITY INVOKER -> reuses existing RLS) ----------
CREATE OR REPLACE FUNCTION public.can_view_work_entity(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE ok boolean := false;
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN SELECT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id = _entity_id) INTO ok;
    WHEN 'TASK' THEN SELECT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id = _entity_id AND t.deleted_at IS NULL) INTO ok;
    WHEN 'MEETING' THEN SELECT EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = _entity_id) INTO ok;
    WHEN 'DOCUMENT' THEN SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.id = _entity_id AND d.deleted_at IS NULL) INTO ok;
    WHEN 'EMAIL' THEN SELECT EXISTS(SELECT 1 FROM public.email_threads e WHERE e.id = _entity_id AND e.deleted_at IS NULL) INTO ok;
    WHEN 'CHAT_CHANNEL' THEN SELECT EXISTS(SELECT 1 FROM public.chat_channels c WHERE c.id = _entity_id AND c.deleted_at IS NULL) INTO ok;
    WHEN 'PERSON' THEN SELECT EXISTS(
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _entity_id AND public.is_tenant_member(tm.tenant_id)) INTO ok;
    WHEN 'TENANT' THEN SELECT public.is_tenant_member(_entity_id) INTO ok;
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok, false);
END;
$$;

-- 5) Scope resolver (definer; only called after a visibility check) -------
CREATE OR REPLACE FUNCTION public._work_entity_scope(_entity_type text, _entity_id uuid)
RETURNS TABLE (tenant_id uuid, workspace_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN RETURN QUERY SELECT w.tenant_id, w.id FROM public.workspaces w WHERE w.id = _entity_id;
    WHEN 'TASK' THEN RETURN QUERY SELECT t.tenant_id, t.workspace_id FROM public.tasks t WHERE t.id = _entity_id;
    WHEN 'MEETING' THEN RETURN QUERY SELECT m.tenant_id, m.workspace_id FROM public.meetings m WHERE m.id = _entity_id;
    WHEN 'DOCUMENT' THEN RETURN QUERY SELECT d.tenant_id, d.workspace_id FROM public.documents d WHERE d.id = _entity_id;
    WHEN 'EMAIL' THEN RETURN QUERY SELECT e.tenant_id, e.workspace_id FROM public.email_threads e WHERE e.id = _entity_id;
    WHEN 'CHAT_CHANNEL' THEN RETURN QUERY SELECT c.tenant_id, c.workspace_id FROM public.chat_channels c WHERE c.id = _entity_id;
    WHEN 'TENANT' THEN RETURN QUERY SELECT _entity_id, NULL::uuid;
    ELSE RETURN;
  END CASE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._work_entity_scope(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._work_entity_scope(text, uuid) TO authenticated, service_role;

-- 6) Edge validation trigger ---------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_work_edges_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.work_nodes%ROWTYPE;
  t public.work_nodes%ROWTYPE;
  reg public.work_relationship_types%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.work_nodes WHERE id = NEW.source_node_id;
  SELECT * INTO t FROM public.work_nodes WHERE id = NEW.target_node_id;
  IF s.id IS NULL OR t.id IS NULL THEN
    RAISE EXCEPTION 'WORK_GRAPH_ENTITY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF s.tenant_id <> t.tenant_id THEN
    RAISE EXCEPTION 'WORK_GRAPH_CROSS_TENANT' USING ERRCODE = 'P0001';
  END IF;
  NEW.tenant_id := s.tenant_id;
  NEW.workspace_id := COALESCE(NEW.workspace_id, s.workspace_id, t.workspace_id);

  SELECT * INTO reg FROM public.work_relationship_types r
   WHERE r.code = NEW.relationship_type
     AND r.source_type = s.entity_type
     AND r.target_type = t.entity_type;
  IF reg.code IS NULL THEN
    RAISE EXCEPTION 'WORK_GRAPH_RELATION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.origin = 'USER' AND NOT reg.user_creatable THEN
    RAISE EXCEPTION 'WORK_GRAPH_EDGE_PROTECTED' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER work_edges_validate
  BEFORE INSERT OR UPDATE ON public.work_edges
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_edges_validate();

-- 7) Node tenant guard ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_work_nodes_fill_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sc record;
BEGIN
  SELECT * INTO sc FROM public._work_entity_scope(NEW.entity_type, NEW.entity_id);
  IF NEW.entity_type <> 'PERSON' THEN
    IF sc.tenant_id IS NULL THEN
      RAISE EXCEPTION 'WORK_GRAPH_ENTITY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> sc.tenant_id THEN
      RAISE EXCEPTION 'WORK_GRAPH_CROSS_TENANT' USING ERRCODE = 'P0001';
    END IF;
    NEW.tenant_id := sc.tenant_id;
    NEW.workspace_id := sc.workspace_id;
  END IF;
  NEW.created_by := COALESCE(NEW.created_by, public.current_internal_user_id());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER work_nodes_fill_scope
  BEFORE INSERT ON public.work_nodes
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_nodes_fill_scope();

-- 8) RLS ------------------------------------------------------------------
GRANT SELECT ON public.work_nodes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.work_edges TO authenticated;
GRANT INSERT ON public.work_nodes TO authenticated;
GRANT ALL ON public.work_nodes TO service_role;
GRANT ALL ON public.work_edges TO service_role;
ALTER TABLE public.work_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_nodes_select" ON public.work_nodes FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id) AND public.can_view_work_entity(entity_type, entity_id));

CREATE POLICY "work_nodes_insert" ON public.work_nodes FOR INSERT TO authenticated
WITH CHECK (public.can_view_work_entity(entity_type, entity_id));

CREATE POLICY "work_edges_select" ON public.work_edges FOR SELECT TO authenticated
USING (
  public.is_tenant_member(tenant_id)
  AND EXISTS (SELECT 1 FROM public.work_nodes n WHERE n.id = work_edges.source_node_id)
  AND EXISTS (SELECT 1 FROM public.work_nodes n WHERE n.id = work_edges.target_node_id)
);

CREATE POLICY "work_edges_insert" ON public.work_edges FOR INSERT TO authenticated
WITH CHECK (
  origin = 'USER'
  AND EXISTS (SELECT 1 FROM public.work_nodes n WHERE n.id = source_node_id)
  AND EXISTS (SELECT 1 FROM public.work_nodes n WHERE n.id = target_node_id)
);

CREATE POLICY "work_edges_delete" ON public.work_edges FOR DELETE TO authenticated
USING (
  origin = 'USER'
  AND public.is_tenant_member(tenant_id)
  AND EXISTS (SELECT 1 FROM public.work_nodes n WHERE n.id = work_edges.source_node_id)
  AND EXISTS (SELECT 1 FROM public.work_nodes n WHERE n.id = work_edges.target_node_id)
);

-- 9) ensure node (invoker: RLS insert policy enforces permission) ---------
CREATE OR REPLACE FUNCTION public.ensure_work_node(_entity_type text, _entity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE nid uuid;
BEGIN
  SELECT id INTO nid FROM public.work_nodes
   WHERE entity_type = _entity_type AND entity_id = _entity_id;
  IF nid IS NOT NULL THEN RETURN nid; END IF;
  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  VALUES (COALESCE((SELECT s.tenant_id FROM public._work_entity_scope(_entity_type, _entity_id) s),
                   (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _entity_id LIMIT 1)),
          _entity_type, _entity_id)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING
  RETURNING id INTO nid;
  IF nid IS NULL THEN
    SELECT id INTO nid FROM public.work_nodes
     WHERE entity_type = _entity_type AND entity_id = _entity_id;
  END IF;
  RETURN nid;
END;
$$;

-- 10) system link helper (definer; used by projection triggers) -----------
CREATE OR REPLACE FUNCTION public._work_graph_link_system(
  _source_type text, _source_id uuid,
  _target_type text, _target_id uuid,
  _relationship text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sn uuid; tn uuid; eid uuid; st uuid; tt uuid;
BEGIN
  IF _source_id IS NULL OR _target_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE((SELECT s.tenant_id FROM public._work_entity_scope(_source_type, _source_id) s),
                  (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _source_id LIMIT 1))
    INTO st;
  SELECT COALESCE((SELECT s.tenant_id FROM public._work_entity_scope(_target_type, _target_id) s),
                  (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target_id LIMIT 1))
    INTO tt;
  IF st IS NULL OR tt IS NULL OR st <> tt THEN RETURN NULL; END IF;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  VALUES (st, _source_type, _source_id)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;
  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  VALUES (tt, _target_type, _target_id)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  SELECT id INTO sn FROM public.work_nodes WHERE tenant_id = st AND entity_type = _source_type AND entity_id = _source_id;
  SELECT id INTO tn FROM public.work_nodes WHERE tenant_id = tt AND entity_type = _target_type AND entity_id = _target_id;
  IF sn IS NULL OR tn IS NULL OR sn = tn THEN RETURN NULL; END IF;

  INSERT INTO public.work_edges (tenant_id, source_node_id, target_node_id, relationship_type, origin, metadata)
  VALUES (st, sn, tn, _relationship, 'SYSTEM', _metadata)
  ON CONFLICT (tenant_id, source_node_id, target_node_id, relationship_type) DO NOTHING
  RETURNING id INTO eid;
  IF eid IS NULL THEN
    SELECT id INTO eid FROM public.work_edges
     WHERE tenant_id = st AND source_node_id = sn AND target_node_id = tn AND relationship_type = _relationship;
  END IF;
  RETURN eid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._work_graph_link_system(text, uuid, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._work_graph_link_system(text, uuid, text, uuid, text, jsonb) TO service_role;

-- reconcile helper: keep exactly one SYSTEM edge of a type from a source
CREATE OR REPLACE FUNCTION public._work_graph_reconcile_single(
  _source_type text, _source_id uuid, _target_type text, _target_id uuid, _relationship text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sn uuid;
BEGIN
  SELECT id INTO sn FROM public.work_nodes WHERE entity_type = _source_type AND entity_id = _source_id;
  IF sn IS NOT NULL THEN
    DELETE FROM public.work_edges e
     USING public.work_nodes n
     WHERE e.source_node_id = sn
       AND e.relationship_type = _relationship
       AND e.origin = 'SYSTEM'
       AND n.id = e.target_node_id
       AND n.entity_type = _target_type
       AND (_target_id IS NULL OR n.entity_id <> _target_id);
  END IF;
  IF _target_id IS NOT NULL THEN
    PERFORM public._work_graph_link_system(_source_type, _source_id, _target_type, _target_id, _relationship);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._work_graph_reconcile_single(text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._work_graph_reconcile_single(text, uuid, text, uuid, text) TO service_role;

-- 11) Projection triggers -------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_work_graph_project_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'TASK' AND entity_id = NEW.id;
    RETURN NULL;
  END IF;
  PERFORM public._work_graph_reconcile_single('TASK', NEW.id, 'WORKSPACE', NEW.workspace_id, 'BELONGS_TO');
  PERFORM public._work_graph_reconcile_single('TASK', NEW.id, 'TASK', NEW.parent_task_id, 'BELONGS_TO');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_task
  AFTER INSERT OR UPDATE OF workspace_id, parent_task_id, deleted_at ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_task();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_meeting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._work_graph_reconcile_single('MEETING', NEW.id, 'WORKSPACE', NEW.workspace_id, 'BELONGS_TO');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_meeting
  AFTER INSERT OR UPDATE OF workspace_id ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_meeting();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'DOCUMENT' AND entity_id = NEW.id;
    RETURN NULL;
  END IF;
  PERFORM public._work_graph_reconcile_single('DOCUMENT', NEW.id, 'WORKSPACE', NEW.workspace_id, 'BELONGS_TO');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_document
  AFTER INSERT OR UPDATE OF workspace_id, deleted_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_document();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_email_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'EMAIL' AND entity_id = NEW.id;
    RETURN NULL;
  END IF;
  PERFORM public._work_graph_reconcile_single('EMAIL', NEW.id, 'WORKSPACE', NEW.workspace_id, 'BELONGS_TO');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_email_thread
  AFTER INSERT OR UPDATE OF workspace_id, deleted_at ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_email_thread();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'CHAT_CHANNEL' AND entity_id = NEW.id;
    RETURN NULL;
  END IF;
  PERFORM public._work_graph_reconcile_single('CHAT_CHANNEL', NEW.id, 'WORKSPACE', NEW.workspace_id, 'BELONGS_TO');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_channel
  AFTER INSERT OR UPDATE OF workspace_id, deleted_at ON public.chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_channel();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_task_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sn uuid; tn uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT id INTO sn FROM public.work_nodes WHERE entity_type = 'TASK' AND entity_id = OLD.task_id;
    SELECT id INTO tn FROM public.work_nodes WHERE entity_type = 'PERSON' AND entity_id = OLD.user_id;
    IF sn IS NOT NULL AND tn IS NOT NULL THEN
      DELETE FROM public.work_edges
       WHERE source_node_id = sn AND target_node_id = tn
         AND relationship_type = 'ASSIGNED_TO' AND origin = 'SYSTEM';
    END IF;
    RETURN NULL;
  END IF;
  PERFORM public._work_graph_link_system('TASK', NEW.task_id, 'PERSON', NEW.user_id, 'ASSIGNED_TO');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_task_assignee
  AFTER INSERT OR DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_task_assignee();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_meeting_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sn uuid; tn uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT id INTO sn FROM public.work_nodes WHERE entity_type = 'PERSON' AND entity_id = OLD.user_id;
    SELECT id INTO tn FROM public.work_nodes WHERE entity_type = 'MEETING' AND entity_id = OLD.meeting_id;
    IF sn IS NOT NULL AND tn IS NOT NULL THEN
      DELETE FROM public.work_edges
       WHERE source_node_id = sn AND target_node_id = tn
         AND relationship_type = 'PARTICIPATED_IN' AND origin = 'SYSTEM';
    END IF;
    RETURN NULL;
  END IF;
  PERFORM public._work_graph_link_system('PERSON', NEW.user_id, 'MEETING', NEW.meeting_id, 'PARTICIPATED_IN');
  RETURN NULL;
END; $$;
CREATE TRIGGER work_graph_project_meeting_participant
  AFTER INSERT OR DELETE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_meeting_participant();

-- PERSON nodes need a tenant: fill from tenant_members when created via link helper
CREATE OR REPLACE FUNCTION public.tg_work_nodes_person_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.entity_type = 'PERSON' AND NEW.tenant_id IS NULL THEN
    SELECT tm.tenant_id INTO NEW.tenant_id FROM public.tenant_members tm
     WHERE tm.user_id = NEW.entity_id LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER work_nodes_person_tenant
  BEFORE INSERT ON public.work_nodes
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_nodes_person_tenant();

-- 12) Read API ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_work_context(
  _entity_type text, _entity_id uuid, _limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  lim integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  root uuid;
  rels jsonb;
BEGIN
  IF NOT public.can_view_work_entity(_entity_type, _entity_id) THEN
    RAISE EXCEPTION 'WORK_GRAPH_ENTITY_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO root FROM public.work_nodes
   WHERE entity_type = _entity_type AND entity_id = _entity_id;

  IF root IS NULL THEN
    RETURN jsonb_build_object(
      'entity', jsonb_build_object('type', _entity_type, 'id', _entity_id),
      'relationships', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'createdAt' DESC), '[]'::jsonb) INTO rels
  FROM (
    SELECT jsonb_build_object(
             'edgeId', e.id,
             'type', e.relationship_type,
             'direction', 'OUT',
             'origin', e.origin,
             'entityType', n.entity_type,
             'entityId', n.entity_id,
             'createdAt', e.created_at
           ) AS r
      FROM public.work_edges e
      JOIN public.work_nodes n ON n.id = e.target_node_id
     WHERE e.source_node_id = root
     UNION ALL
    SELECT jsonb_build_object(
             'edgeId', e.id,
             'type', e.relationship_type,
             'direction', 'IN',
             'origin', e.origin,
             'entityType', n.entity_type,
             'entityId', n.entity_id,
             'createdAt', e.created_at
           )
      FROM public.work_edges e
      JOIN public.work_nodes n ON n.id = e.source_node_id
     WHERE e.target_node_id = root
     LIMIT lim
  ) s;

  RETURN jsonb_build_object(
    'entity', jsonb_build_object('type', _entity_type, 'id', _entity_id),
    'relationships', rels);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_work_context(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_work_context(text, uuid, integer) TO authenticated, service_role;

-- 13) Link / unlink commands (invoker -> RLS enforces authorization) ------
CREATE OR REPLACE FUNCTION public.link_work_entities(
  _source_type text, _source_id uuid,
  _target_type text, _target_id uuid,
  _relationship text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE sn uuid; tn uuid; eid uuid; existing uuid;
BEGIN
  IF NOT public.can_view_work_entity(_source_type, _source_id)
     OR NOT public.can_view_work_entity(_target_type, _target_id) THEN
    RAISE EXCEPTION 'WORK_GRAPH_ENTITY_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_relationship_types r
                  WHERE r.code = _relationship AND r.source_type = _source_type
                    AND r.target_type = _target_type AND r.user_creatable) THEN
    RAISE EXCEPTION 'WORK_GRAPH_RELATION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  sn := public.ensure_work_node(_source_type, _source_id);
  tn := public.ensure_work_node(_target_type, _target_id);
  IF sn IS NULL OR tn IS NULL OR sn = tn THEN
    RAISE EXCEPTION 'WORK_GRAPH_RELATION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO existing FROM public.work_edges
   WHERE source_node_id = sn AND target_node_id = tn AND relationship_type = _relationship;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('edgeId', existing, 'created', false);
  END IF;

  INSERT INTO public.work_edges (tenant_id, source_node_id, target_node_id, relationship_type, origin, metadata, created_by)
  SELECT n.tenant_id, sn, tn, _relationship, 'USER',
         COALESCE(_metadata, '{}'::jsonb), public.current_internal_user_id()
    FROM public.work_nodes n WHERE n.id = sn
  RETURNING id INTO eid;

  RETURN jsonb_build_object('edgeId', eid, 'created', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.link_work_entities(text, uuid, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_work_entities(text, uuid, text, uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlink_work_entities(_edge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.work_edges WHERE id = _edge_id AND origin = 'USER';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed = 0 THEN
    RAISE EXCEPTION 'WORK_GRAPH_EDGE_PROTECTED' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('deleted', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unlink_work_entities(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_work_entities(uuid) TO authenticated, service_role;

-- 14) Backfill ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_graph_backfill(_batch integer DEFAULT 500, _dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_before bigint; e_before bigint; n_after bigint; e_after bigint; r record;
BEGIN
  SELECT count(*) INTO n_before FROM public.work_nodes;
  SELECT count(*) INTO e_before FROM public.work_edges;
  IF _dry_run THEN
    RETURN jsonb_build_object('dryRun', true, 'nodes', n_before, 'edges', e_before);
  END IF;

  FOR r IN SELECT id, workspace_id, parent_task_id FROM public.tasks
            WHERE deleted_at IS NULL AND workspace_id IS NOT NULL LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('TASK', r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
    IF r.parent_task_id IS NOT NULL THEN
      PERFORM public._work_graph_link_system('TASK', r.id, 'TASK', r.parent_task_id, 'BELONGS_TO');
    END IF;
  END LOOP;

  FOR r IN SELECT id, workspace_id FROM public.meetings WHERE workspace_id IS NOT NULL LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('MEETING', r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
  END LOOP;

  FOR r IN SELECT id, workspace_id FROM public.documents
            WHERE deleted_at IS NULL AND workspace_id IS NOT NULL LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('DOCUMENT', r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
  END LOOP;

  FOR r IN SELECT id, workspace_id FROM public.email_threads
            WHERE deleted_at IS NULL AND workspace_id IS NOT NULL LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('EMAIL', r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
  END LOOP;

  FOR r IN SELECT id, workspace_id FROM public.chat_channels
            WHERE deleted_at IS NULL AND workspace_id IS NOT NULL LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('CHAT_CHANNEL', r.id, 'WORKSPACE', r.workspace_id, 'BELONGS_TO');
  END LOOP;

  FOR r IN SELECT task_id, user_id FROM public.task_assignees LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('TASK', r.task_id, 'PERSON', r.user_id, 'ASSIGNED_TO');
  END LOOP;

  FOR r IN SELECT meeting_id, user_id FROM public.meeting_participants LIMIT _batch LOOP
    PERFORM public._work_graph_link_system('PERSON', r.user_id, 'MEETING', r.meeting_id, 'PARTICIPATED_IN');
  END LOOP;

  SELECT count(*) INTO n_after FROM public.work_nodes;
  SELECT count(*) INTO e_after FROM public.work_edges;
  RETURN jsonb_build_object(
    'nodesBefore', n_before, 'nodesAfter', n_after, 'nodesCreated', n_after - n_before,
    'edgesBefore', e_before, 'edgesAfter', e_after, 'edgesCreated', e_after - e_before);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.work_graph_backfill(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_graph_backfill(integer, boolean) TO service_role;

-- 15) Integrity / health --------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_graph_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'nodes', (SELECT count(*) FROM public.work_nodes),
    'edges', (SELECT count(*) FROM public.work_edges),
    'userEdges', (SELECT count(*) FROM public.work_edges WHERE origin = 'USER'),
    'crossTenantEdges', (SELECT count(*) FROM public.work_edges e
        JOIN public.work_nodes s ON s.id = e.source_node_id
        JOIN public.work_nodes t ON t.id = e.target_node_id
       WHERE s.tenant_id <> t.tenant_id OR e.tenant_id <> s.tenant_id),
    'invalidRelations', (SELECT count(*) FROM public.work_edges e
        JOIN public.work_nodes s ON s.id = e.source_node_id
        JOIN public.work_nodes t ON t.id = e.target_node_id
        LEFT JOIN public.work_relationship_types r
          ON r.code = e.relationship_type AND r.source_type = s.entity_type AND r.target_type = t.entity_type
       WHERE r.code IS NULL),
    'orphanTaskNodes', (SELECT count(*) FROM public.work_nodes n
       WHERE n.entity_type = 'TASK'
         AND NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = n.entity_id AND t.deleted_at IS NULL)),
    'orphanDocumentNodes', (SELECT count(*) FROM public.work_nodes n
       WHERE n.entity_type = 'DOCUMENT'
         AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = n.entity_id AND d.deleted_at IS NULL)),
    'taskProjectMismatch', (SELECT count(*) FROM public.tasks t
       JOIN public.work_nodes sn ON sn.entity_type = 'TASK' AND sn.entity_id = t.id
       JOIN public.work_edges e ON e.source_node_id = sn.id AND e.relationship_type = 'BELONGS_TO' AND e.origin = 'SYSTEM'
       JOIN public.work_nodes tn ON tn.id = e.target_node_id AND tn.entity_type = 'WORKSPACE'
      WHERE t.deleted_at IS NULL AND t.workspace_id IS DISTINCT FROM tn.entity_id)
  ) INTO res;
  RETURN res;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.work_graph_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_graph_health() TO service_role;
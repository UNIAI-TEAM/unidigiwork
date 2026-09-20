-- DECISION authority + Work Graph projection.
ALTER TABLE public.work_nodes DROP CONSTRAINT IF EXISTS work_nodes_entity_type_check;
ALTER TABLE public.work_nodes ADD CONSTRAINT work_nodes_entity_type_check
  CHECK (entity_type IN (
    'TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL',
    'DOCUMENT','EMAIL','MEETING_ARTIFACT','WORK_PRODUCT','EXECUTION','DECISION'
  ));

INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable, system_creatable)
VALUES
  ('BELONGS_TO', 'DECISION', 'WORKSPACE', false, true),
  ('CREATED_BY', 'PERSON', 'DECISION', false, true),
  ('GENERATES', 'MEETING', 'DECISION', false, true),
  ('REALIZED_AS', 'MEETING_ARTIFACT', 'DECISION', false, true),
  ('REALIZED_AS', 'TASK', 'DECISION', false, true),
  ('REALIZED_AS', 'WORK_PRODUCT', 'DECISION', false, true)
ON CONFLICT (code, source_type, target_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'CANDIDATE'
    CHECK (status IN ('CANDIDATE','CONFIRMED','REJECTED','SUPERSEDED')),
  origin text NOT NULL
    CHECK (origin IN ('MEETING','TASK','CHAT','EMAIL','APPROVAL','MANUAL')),
  source_type text CHECK (source_type IN ('MEETING','MEETING_ARTIFACT','TASK','CHAT_CHANNEL','EMAIL','WORK_PRODUCT')),
  source_id uuid,
  source_ref text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz,
  decided_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  superseded_by uuid REFERENCES public.decisions(id) ON DELETE SET NULL,
  created_by uuid,
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_tenant_idx ON public.decisions (tenant_id, status);
CREATE INDEX IF NOT EXISTS decisions_workspace_idx ON public.decisions (workspace_id);
CREATE INDEX IF NOT EXISTS decisions_source_idx ON public.decisions (source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS decisions_source_ref_uidx
  ON public.decisions (tenant_id, origin, source_ref) WHERE source_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS decisions_select ON public.decisions;
CREATE POLICY decisions_select ON public.decisions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS decisions_insert ON public.decisions;
CREATE POLICY decisions_insert ON public.decisions FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS decisions_update ON public.decisions;
CREATE POLICY decisions_update ON public.decisions FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.decision_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('MEETING_ARTIFACT','TASK','WORK_PRODUCT')),
  source_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'REALIZED_AS' CHECK (relationship IN ('REALIZED_AS')),
  status text NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','CONFIRMED','REJECTED')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, decision_id, source_type, source_id, relationship)
);
CREATE INDEX IF NOT EXISTS decision_links_decision_idx ON public.decision_links (decision_id, status);
CREATE INDEX IF NOT EXISTS decision_links_source_idx ON public.decision_links (source_type, source_id);

GRANT SELECT, INSERT, UPDATE ON public.decision_links TO authenticated;
GRANT ALL ON public.decision_links TO service_role;
ALTER TABLE public.decision_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS decision_links_select ON public.decision_links;
CREATE POLICY decision_links_select ON public.decision_links FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS decision_links_insert ON public.decision_links;
CREATE POLICY decision_links_insert ON public.decision_links FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS decision_links_update ON public.decision_links;
CREATE POLICY decision_links_update ON public.decision_links FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.tg_decision_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decisions_touch ON public.decisions;
CREATE TRIGGER trg_decisions_touch BEFORE UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_decision_touch();
DROP TRIGGER IF EXISTS trg_decision_links_touch ON public.decision_links;
CREATE TRIGGER trg_decision_links_touch BEFORE UPDATE ON public.decision_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_decision_touch();

CREATE OR REPLACE FUNCTION public._work_entity_scope(_entity_type text, _entity_id uuid)
 RETURNS TABLE(tenant_id uuid, workspace_id uuid)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN RETURN QUERY SELECT w.tenant_id, w.id FROM public.workspaces w WHERE w.id = _entity_id;
    WHEN 'TASK' THEN RETURN QUERY SELECT t.tenant_id, t.workspace_id FROM public.tasks t WHERE t.id = _entity_id;
    WHEN 'MEETING' THEN RETURN QUERY SELECT m.tenant_id, m.workspace_id FROM public.meetings m WHERE m.id = _entity_id;
    WHEN 'MEETING_ARTIFACT' THEN RETURN QUERY SELECT a.tenant_id, a.workspace_id FROM public.meeting_artifacts a WHERE a.id = _entity_id;
    WHEN 'DOCUMENT' THEN RETURN QUERY SELECT d.tenant_id, d.workspace_id FROM public.documents d WHERE d.id = _entity_id;
    WHEN 'EMAIL' THEN RETURN QUERY SELECT e.tenant_id, e.workspace_id FROM public.email_threads e WHERE e.id = _entity_id;
    WHEN 'CHAT_CHANNEL' THEN RETURN QUERY SELECT c.tenant_id, c.workspace_id FROM public.chat_channels c WHERE c.id = _entity_id;
    WHEN 'TENANT' THEN RETURN QUERY SELECT _entity_id, NULL::uuid;
    WHEN 'WORK_PRODUCT' THEN RETURN QUERY SELECT s.tenant_id, s.workspace_id FROM public._go3_work_product_scope(_entity_id) s;
    WHEN 'EXECUTION' THEN RETURN QUERY SELECT e.tenant_id, e.workspace_id FROM public.ai_task_executions e WHERE e.id = _entity_id;
    WHEN 'DECISION' THEN RETURN QUERY SELECT d.tenant_id, d.workspace_id FROM public.decisions d WHERE d.id = _entity_id;
    ELSE RETURN;
  END CASE;
END $function$;

CREATE OR REPLACE FUNCTION public.can_view_work_entity(_entity_type text, _entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE ok boolean := false;
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN SELECT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id = _entity_id) INTO ok;
    WHEN 'TASK' THEN SELECT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id = _entity_id AND t.deleted_at IS NULL) INTO ok;
    WHEN 'MEETING' THEN SELECT EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = _entity_id) INTO ok;
    WHEN 'MEETING_ARTIFACT' THEN SELECT EXISTS(SELECT 1 FROM public.meeting_artifacts a WHERE a.id = _entity_id) INTO ok;
    WHEN 'DOCUMENT' THEN SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.id = _entity_id AND d.deleted_at IS NULL) INTO ok;
    WHEN 'EMAIL' THEN SELECT EXISTS(SELECT 1 FROM public.email_threads e WHERE e.id = _entity_id AND e.deleted_at IS NULL) INTO ok;
    WHEN 'CHAT_CHANNEL' THEN SELECT EXISTS(SELECT 1 FROM public.chat_channels c WHERE c.id = _entity_id AND c.deleted_at IS NULL) INTO ok;
    WHEN 'PERSON' THEN SELECT EXISTS(
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _entity_id AND public.is_tenant_member(tm.tenant_id)) INTO ok;
    WHEN 'TENANT' THEN SELECT public.is_tenant_member(_entity_id) INTO ok;
    WHEN 'WORK_PRODUCT' THEN ok := public._go3_can_view_work_product(_entity_id);
    WHEN 'EXECUTION' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.ai_task_executions e
         JOIN public.tasks t ON t.id = e.task_id AND t.deleted_at IS NULL
        WHERE e.id = _entity_id AND public.is_tenant_member(e.tenant_id)
      ) INTO ok;
    WHEN 'DECISION' THEN
      SELECT EXISTS(SELECT 1 FROM public.decisions d WHERE d.id = _entity_id) INTO ok;
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok, false);
END $function$;

CREATE OR REPLACE FUNCTION public._project_decision_link(_link_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.decision_links%ROWTYPE; d public.decisions%ROWTYPE; sn uuid; tn uuid;
BEGIN
  SELECT * INTO l FROM public.decision_links WHERE id = _link_id;
  IF l.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.decisions WHERE id = l.decision_id;
  IF d.id IS NULL THEN RETURN NULL; END IF;

  IF l.status <> 'CONFIRMED' OR d.status NOT IN ('CONFIRMED','SUPERSEDED') THEN
    SELECT id INTO sn FROM public.work_nodes
     WHERE tenant_id = l.tenant_id AND entity_type = l.source_type AND entity_id = l.source_id;
    SELECT id INTO tn FROM public.work_nodes
     WHERE tenant_id = l.tenant_id AND entity_type = 'DECISION' AND entity_id = l.decision_id;
    IF sn IS NOT NULL AND tn IS NOT NULL THEN
      DELETE FROM public.work_edges
       WHERE tenant_id = l.tenant_id AND source_node_id = sn AND target_node_id = tn
         AND relationship_type = l.relationship;
    END IF;
    RETURN NULL;
  END IF;

  RETURN public._work_graph_link_system_in_tenant(
    l.tenant_id, l.source_type, l.source_id, 'DECISION', l.decision_id, l.relationship,
    jsonb_build_object('decisionLinkId', l.id, 'confirmedAt', l.confirmed_at));
END $$;
REVOKE ALL ON FUNCTION public._project_decision_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._project_decision_link(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public._touch_decision_graph_node(_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.decisions%ROWTYPE; nid uuid;
BEGIN
  SELECT * INTO d FROM public.decisions WHERE id = _decision_id;
  IF d.id IS NULL OR d.status NOT IN ('CONFIRMED','SUPERSEDED') THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'DECISION' AND entity_id = _decision_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id, workspace_id, metadata)
  VALUES (d.tenant_id, 'DECISION', d.id, d.workspace_id, jsonb_build_object(
    'title', d.title, 'status', d.status, 'origin', d.origin,
    'decidedAt', d.decided_at, 'confirmedAt', d.confirmed_at))
  ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE
    SET workspace_id = EXCLUDED.workspace_id,
        metadata = EXCLUDED.metadata,
        updated_at = now();

  SELECT id INTO nid FROM public.work_nodes
   WHERE tenant_id = d.tenant_id AND entity_type = 'DECISION' AND entity_id = d.id;

  IF d.workspace_id IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      d.tenant_id, 'DECISION', d.id, 'WORKSPACE', d.workspace_id, 'BELONGS_TO');
  END IF;
  IF d.source_type = 'MEETING' AND d.source_id IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      d.tenant_id, 'MEETING', d.source_id, 'DECISION', d.id, 'GENERATES');
  END IF;
  IF d.created_by IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      d.tenant_id, 'PERSON', d.created_by, 'DECISION', d.id, 'CREATED_BY');
  END IF;

  PERFORM public._project_decision_link(l.id) FROM public.decision_links l
   WHERE l.decision_id = d.id AND l.status = 'CONFIRMED';

  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public._touch_decision_graph_node(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._touch_decision_graph_node(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public._touch_decision_graph_node(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decision graph projection failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_work_graph_project_decision ON public.decisions;
CREATE TRIGGER trg_work_graph_project_decision
  AFTER INSERT OR UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_decision();

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_decision_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public._project_decision_link(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decision link projection failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_work_graph_project_decision_link ON public.decision_links;
CREATE TRIGGER trg_work_graph_project_decision_link
  AFTER INSERT OR UPDATE ON public.decision_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_project_decision_link();

CREATE OR REPLACE FUNCTION public.confirm_decision(_decision_id uuid, _confirm boolean DEFAULT true)
RETURNS public.decisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); d public.decisions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO d FROM public.decisions WHERE id = _decision_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DECISION_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(d.tenant_id) THEN
    RAISE EXCEPTION 'DECISION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  UPDATE public.decisions
     SET status = CASE WHEN _confirm THEN 'CONFIRMED' ELSE 'REJECTED' END,
         confirmed_by = CASE WHEN _confirm THEN _actor ELSE NULL END,
         confirmed_at = CASE WHEN _confirm THEN now() ELSE NULL END,
         updated_by = _actor,
         row_version = row_version + 1
   WHERE id = _decision_id
   RETURNING * INTO d;
  RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.confirm_decision(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_decision(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_decision_link(_link_id uuid, _confirm boolean DEFAULT true)
RETURNS public.decision_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); l public.decision_links%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO l FROM public.decision_links WHERE id = _link_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'DECISION_LINK_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(l.tenant_id) THEN
    RAISE EXCEPTION 'DECISION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  UPDATE public.decision_links
     SET status = CASE WHEN _confirm THEN 'CONFIRMED' ELSE 'REJECTED' END,
         confirmed_by = CASE WHEN _confirm THEN _actor ELSE NULL END,
         confirmed_at = CASE WHEN _confirm THEN now() ELSE NULL END
   WHERE id = _link_id
   RETURNING * INTO l;
  RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.confirm_decision_link(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_decision_link(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.backfill_decisions_from_meetings(
  _tenant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 500)
RETURNS TABLE (decisions_created integer, links_created integer, decision_nodes integer, decision_edges integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dc integer := 0; lc integer := 0;
BEGIN
  WITH src AS (
    SELECT a.*
      FROM public.meeting_artifacts a
     WHERE a.kind = 'DECISION'
       AND (_tenant_id IS NULL OR a.tenant_id = _tenant_id)
     ORDER BY a.created_at
     LIMIT GREATEST(_limit, 0)
  ), ins AS (
    INSERT INTO public.decisions (
      tenant_id, workspace_id, title, detail, status, origin,
      source_type, source_id, source_ref, evidence, decided_at, created_at)
    SELECT s.tenant_id, s.workspace_id, s.title, s.detail, 'CANDIDATE', 'MEETING',
           'MEETING', s.meeting_id, s.id::text,
           jsonb_build_object('artifactId', s.id, 'itemKey', s.item_key,
                              'confidence', s.confidence, 'sourceIds', s.source_ids),
           s.created_at, s.created_at
      FROM src s
    ON CONFLICT (tenant_id, origin, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO dc FROM ins;

  WITH pairs AS (
    SELECT d.tenant_id, d.id AS decision_id, ai.id AS artifact_id,
           jsonb_build_object('rule', 'SAME_MEETING', 'meetingId', d.source_id,
                              'actionItemKey', ai.item_key) AS ev
      FROM public.decisions d
      JOIN public.meeting_artifacts ai
        ON ai.meeting_id = d.source_id
       AND ai.kind = 'ACTION_ITEM'
       AND ai.tenant_id = d.tenant_id
     WHERE d.origin = 'MEETING'
       AND d.source_type = 'MEETING'
       AND (_tenant_id IS NULL OR d.tenant_id = _tenant_id)
  ), ins2 AS (
    INSERT INTO public.decision_links (
      tenant_id, decision_id, source_type, source_id, relationship, status, evidence)
    SELECT p.tenant_id, p.decision_id, 'MEETING_ARTIFACT', p.artifact_id, 'REALIZED_AS', 'CANDIDATE', p.ev
      FROM pairs p
    ON CONFLICT (tenant_id, decision_id, source_type, source_id, relationship) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO lc FROM ins2;

  PERFORM public._touch_decision_graph_node(d.id)
     FROM public.decisions d
    WHERE d.status IN ('CONFIRMED','SUPERSEDED')
      AND (_tenant_id IS NULL OR d.tenant_id = _tenant_id);

  RETURN QUERY
  SELECT dc, lc,
    (SELECT count(*)::integer FROM public.work_nodes n
      WHERE n.entity_type = 'DECISION' AND (_tenant_id IS NULL OR n.tenant_id = _tenant_id)),
    (SELECT count(*)::integer FROM public.work_edges e
      JOIN public.work_nodes n ON n.id = e.target_node_id AND n.entity_type = 'DECISION'
     WHERE e.relationship_type = 'REALIZED_AS' AND (_tenant_id IS NULL OR e.tenant_id = _tenant_id));
END $$;
REVOKE ALL ON FUNCTION public.backfill_decisions_from_meetings(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_decisions_from_meetings(uuid, integer) TO postgres, service_role;
-- ============================================================
-- MEETING ARTIFACTS → WORK GRAPH PROVENANCE
-- ============================================================

CREATE TABLE public.meeting_artifacts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('SUMMARY','DECISION','ACTION_ITEM','RISK','OPEN_QUESTION','FOLLOW_UP')),
  item_key text NOT NULL,
  title text NOT NULL,
  detail text,
  confidence text,
  source_ids text[] NOT NULL DEFAULT '{}',
  summary_version integer NOT NULL DEFAULT 1,
  transcript_checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, kind, item_key)
);
CREATE INDEX meeting_artifacts_meeting_idx ON public.meeting_artifacts (meeting_id, kind);
CREATE INDEX meeting_artifacts_tenant_idx ON public.meeting_artifacts (tenant_id);

GRANT SELECT ON public.meeting_artifacts TO authenticated;
GRANT ALL ON public.meeting_artifacts TO service_role;

ALTER TABLE public.meeting_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_artifacts_select" ON public.meeting_artifacts FOR SELECT TO authenticated
USING (
  public.is_tenant_member(tenant_id)
  AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_artifacts.meeting_id)
);

-- 1) Work Graph: new entity type + relationship registry ------------------
ALTER TABLE public.work_nodes DROP CONSTRAINT IF EXISTS work_nodes_entity_type_check;
ALTER TABLE public.work_nodes ADD CONSTRAINT work_nodes_entity_type_check
  CHECK (entity_type IN ('TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL','DOCUMENT','EMAIL','MEETING_ARTIFACT'));

INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable) VALUES
  ('GENERATES','MEETING','MEETING_ARTIFACT',false),
  ('BELONGS_TO','MEETING_ARTIFACT','WORKSPACE',false),
  ('GENERATES','MEETING_ARTIFACT','TASK',false),
  ('REFERENCES','MEETING_ARTIFACT','DOCUMENT',true),
  ('RELATED_TO','MEETING_ARTIFACT','TASK',true)
ON CONFLICT DO NOTHING;

-- 2) Visibility + scope resolvers ----------------------------------------
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
    WHEN 'MEETING_ARTIFACT' THEN SELECT EXISTS(SELECT 1 FROM public.meeting_artifacts a WHERE a.id = _entity_id) INTO ok;
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
    WHEN 'MEETING_ARTIFACT' THEN RETURN QUERY SELECT a.tenant_id, a.workspace_id FROM public.meeting_artifacts a WHERE a.id = _entity_id;
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

-- 3) Deterministic keys (mirrors actionItemKey in the app) ----------------
CREATE OR REPLACE FUNCTION public._meeting_item_key(_title text, _source_ids text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(
    trim(both '-' from regexp_replace(
      regexp_replace(
        regexp_replace(normalize(lower(COALESCE(_title,'')), NFD), '[\u0300-\u036f]', '', 'g'),
        '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g')),
    ''), 'item')
  || '#'
  || COALESCE(NULLIF((
      SELECT string_agg(x, ',' ORDER BY x)
      FROM unnest(COALESCE(_source_ids, '{}'::text[])) AS x
    ), ''), 'na');
$$;

CREATE OR REPLACE FUNCTION public._meeting_artifact_id(_meeting_id uuid, _kind text, _item_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(_meeting_id::text || ':' || _kind || ':' || _item_key)::uuid;
$$;

-- 4) Upsert one artifact + Work Graph edges -------------------------------
CREATE OR REPLACE FUNCTION public._upsert_meeting_artifact(
  _meeting_id uuid, _kind text, _item_key text, _title text,
  _detail text, _confidence text, _source_ids text[],
  _version integer, _checksum text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  aid uuid;
  m public.meetings%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.meetings WHERE id = _meeting_id;
  IF m.id IS NULL THEN RETURN NULL; END IF;

  aid := public._meeting_artifact_id(_meeting_id, _kind, _item_key);

  INSERT INTO public.meeting_artifacts
    (id, tenant_id, workspace_id, meeting_id, kind, item_key, title, detail, confidence,
     source_ids, summary_version, transcript_checksum)
  VALUES
    (aid, m.tenant_id, m.workspace_id, _meeting_id, _kind, _item_key,
     COALESCE(NULLIF(_title,''), _kind), _detail, _confidence,
     COALESCE(_source_ids, '{}'::text[]), COALESCE(_version,1), _checksum)
  ON CONFLICT (meeting_id, kind, item_key) DO UPDATE
    SET title = EXCLUDED.title,
        detail = EXCLUDED.detail,
        confidence = EXCLUDED.confidence,
        source_ids = EXCLUDED.source_ids,
        summary_version = EXCLUDED.summary_version,
        transcript_checksum = EXCLUDED.transcript_checksum,
        workspace_id = EXCLUDED.workspace_id,
        updated_at = now();

  -- provenance: meeting GENERATES artifact
  PERFORM public._work_graph_link_system(
    'MEETING', _meeting_id, 'MEETING_ARTIFACT', aid, 'GENERATES',
    jsonb_build_object('kind', _kind, 'itemKey', _item_key,
                       'meetingId', _meeting_id, 'summaryVersion', COALESCE(_version,1),
                       'transcriptChecksum', _checksum,
                       'sourceIds', to_jsonb(COALESCE(_source_ids,'{}'::text[]))));

  IF m.workspace_id IS NOT NULL THEN
    PERFORM public._work_graph_link_system(
      'MEETING_ARTIFACT', aid, 'WORKSPACE', m.workspace_id, 'BELONGS_TO',
      jsonb_build_object('meetingId', _meeting_id, 'kind', _kind));
  END IF;

  RETURN aid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._upsert_meeting_artifact(uuid, text, text, text, text, text, text[], integer, text) FROM PUBLIC;

-- 5) Rebuild all artifacts of a meeting from its summary ------------------
CREATE OR REPLACE FUNCTION public.sync_meeting_artifacts(_meeting_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.meeting_summaries%ROWTYPE;
  el jsonb;
  ids uuid[] := '{}';
  aid uuid;
  ver integer;
  chk text;
  sids text[];
  stale uuid[];
BEGIN
  SELECT * INTO s FROM public.meeting_summaries WHERE meeting_id = _meeting_id;
  IF s.meeting_id IS NULL THEN RETURN 0; END IF;
  ver := COALESCE(s.version, 1);
  chk := s.transcript_checksum;

  IF COALESCE(s.summary, '') <> '' THEN
    aid := public._upsert_meeting_artifact(
      _meeting_id, 'SUMMARY', 'summary', left(s.summary, 200), s.summary, NULL,
      '{}'::text[], ver, chk);
    IF aid IS NOT NULL THEN ids := ids || aid; END IF;
  END IF;

  FOR el IN SELECT * FROM jsonb_array_elements(COALESCE(s.decisions, '[]'::jsonb)) LOOP
    sids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(el->'sourceIds','[]'::jsonb)));
    aid := public._upsert_meeting_artifact(
      _meeting_id, 'DECISION', public._meeting_item_key(el->>'title', sids),
      COALESCE(el->>'title',''), el->>'detail', el->>'confidence', sids, ver, chk);
    IF aid IS NOT NULL THEN ids := ids || aid; END IF;
  END LOOP;

  FOR el IN SELECT * FROM jsonb_array_elements(COALESCE(s.action_items, '[]'::jsonb)) LOOP
    sids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(el->'sourceIds','[]'::jsonb)));
    aid := public._upsert_meeting_artifact(
      _meeting_id, 'ACTION_ITEM', public._meeting_item_key(el->>'title', sids),
      COALESCE(el->>'title',''), NULLIF(el->>'owner',''), NULLIF(el->>'dueHint',''), sids, ver, chk);
    IF aid IS NOT NULL THEN ids := ids || aid; END IF;
  END LOOP;

  FOR el IN SELECT * FROM jsonb_array_elements(COALESCE(s.risks, '[]'::jsonb)) LOOP
    sids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(el->'sourceIds','[]'::jsonb)));
    aid := public._upsert_meeting_artifact(
      _meeting_id, 'RISK', public._meeting_item_key(el->>'title', sids),
      COALESCE(el->>'title',''), NULL, NULL, sids, ver, chk);
    IF aid IS NOT NULL THEN ids := ids || aid; END IF;
  END LOOP;

  FOR el IN SELECT * FROM jsonb_array_elements(COALESCE(s.open_questions, '[]'::jsonb)) LOOP
    sids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(el->'sourceIds','[]'::jsonb)));
    aid := public._upsert_meeting_artifact(
      _meeting_id, 'OPEN_QUESTION', public._meeting_item_key(el->>'question', sids),
      COALESCE(el->>'question',''), NULL, NULL, sids, ver, chk);
    IF aid IS NOT NULL THEN ids := ids || aid; END IF;
  END LOOP;

  IF s.followup IS NOT NULL AND COALESCE(s.followup->>'subject','') <> '' THEN
    aid := public._upsert_meeting_artifact(
      _meeting_id, 'FOLLOW_UP', 'followup', s.followup->>'subject', s.followup->>'body',
      NULL, '{}'::text[], ver, chk);
    IF aid IS NOT NULL THEN ids := ids || aid; END IF;
  END IF;

  -- drop artifacts (and their graph nodes/edges) no longer produced
  SELECT COALESCE(array_agg(a.id), '{}') INTO stale
    FROM public.meeting_artifacts a
   WHERE a.meeting_id = _meeting_id AND NOT (a.id = ANY(ids));

  IF array_length(stale, 1) IS NOT NULL THEN
    DELETE FROM public.work_nodes n
     WHERE n.entity_type = 'MEETING_ARTIFACT' AND n.entity_id = ANY(stale);
    DELETE FROM public.meeting_artifacts a WHERE a.id = ANY(stale);
  END IF;

  RETURN COALESCE(array_length(ids, 1), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_meeting_artifacts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_meeting_artifacts(uuid) TO service_role;

-- 6) Triggers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_meeting_summary_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_meeting_artifacts(NEW.meeting_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_summary_artifacts ON public.meeting_summaries;
CREATE TRIGGER meeting_summary_artifacts
  AFTER INSERT OR UPDATE ON public.meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.tg_meeting_summary_artifacts();

-- action item confirmed → artifact GENERATES task (provenance)
CREATE OR REPLACE FUNCTION public.tg_meeting_action_item_task_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE aid uuid;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;
  SELECT a.id INTO aid FROM public.meeting_artifacts a
   WHERE a.meeting_id = NEW.meeting_id AND a.kind = 'ACTION_ITEM' AND a.item_key = NEW.item_key;
  IF aid IS NULL THEN RETURN NEW; END IF;
  PERFORM public._work_graph_link_system(
    'MEETING_ARTIFACT', aid, 'TASK', NEW.task_id, 'GENERATES',
    jsonb_build_object('meetingId', NEW.meeting_id, 'itemKey', NEW.item_key, 'kind', 'ACTION_ITEM'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_action_item_task_edge ON public.meeting_action_item_states;
CREATE TRIGGER meeting_action_item_task_edge
  AFTER INSERT OR UPDATE OF task_id ON public.meeting_action_item_states
  FOR EACH ROW EXECUTE FUNCTION public.tg_meeting_action_item_task_edge();

-- 7) Backfill existing summaries -----------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT meeting_id FROM public.meeting_summaries LOOP
    PERFORM public.sync_meeting_artifacts(r.meeting_id);
  END LOOP;
END $$;
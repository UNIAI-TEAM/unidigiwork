-- UniWork Chat — Conversation to Work
-- Manual conversation imports, AI extraction proposals, source citations,
-- external messaging connections. Tenant scoped, RLS enforced, one writer via RPC.

-- 1) External messaging connections (tenant owned; no tokens stored here)
CREATE TABLE IF NOT EXISTS public.external_messaging_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('zalo','whatsapp','telegram','viber','other')),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'MANUAL_ONLY'
    CHECK (status IN ('MANUAL_ONLY','PENDING','CONNECTED','ERROR','DISCONNECTED')),
  capabilities jsonb NOT NULL DEFAULT '{"manualImport":true,"receive":false,"reply":false,"groupSupport":false}'::jsonb,
  secret_ref text,
  last_health_at timestamptz,
  last_error text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, provider, display_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_messaging_connections TO authenticated;
GRANT ALL ON public.external_messaging_connections TO service_role;
ALTER TABLE public.external_messaging_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emc_select" ON public.external_messaging_connections
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "emc_write" ON public.external_messaging_connections
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'));

-- 2) Manual conversation imports
CREATE TABLE IF NOT EXISTS public.conversation_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid,
  source_channel text NOT NULL CHECK (source_channel IN ('zalo','whatsapp','telegram','viber','other')),
  source_group_name text NOT NULL,
  shared_by_label text,
  original_at timestamptz,
  ingest_mode text NOT NULL DEFAULT 'MANUAL_IMPORT' CHECK (ingest_mode IN ('MANUAL_IMPORT','CONNECTOR')),
  visibility text NOT NULL DEFAULT 'TENANT' CHECK (visibility IN ('PRIVATE','TENANT')),
  fingerprint text NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  notes text,
  imported_by uuid NOT NULL,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS conversation_imports_tenant_idx
  ON public.conversation_imports(tenant_id, created_at DESC);

GRANT SELECT ON public.conversation_imports TO authenticated;
GRANT ALL ON public.conversation_imports TO service_role;
ALTER TABLE public.conversation_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_imports_select" ON public.conversation_imports
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (visibility = 'TENANT' OR imported_by = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.conversation_import_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES public.conversation_imports(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  author_label text NOT NULL DEFAULT 'Không rõ',
  sent_at timestamptz,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, seq)
);

CREATE INDEX IF NOT EXISTS conversation_import_messages_import_idx
  ON public.conversation_import_messages(import_id, seq);

GRANT SELECT ON public.conversation_import_messages TO authenticated;
GRANT ALL ON public.conversation_import_messages TO service_role;
ALTER TABLE public.conversation_import_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_import_messages_select" ON public.conversation_import_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_imports ci
    WHERE ci.id = import_id
      AND public.is_tenant_member(ci.tenant_id)
      AND (ci.visibility = 'TENANT' OR ci.imported_by = auth.uid())
  ));

-- 3) External identity mapping
CREATE TABLE IF NOT EXISTS public.external_identity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  external_label text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, provider, external_id)
);

GRANT SELECT ON public.external_identity_map TO authenticated;
GRANT ALL ON public.external_identity_map TO service_role;
ALTER TABLE public.external_identity_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "external_identity_map_select" ON public.external_identity_map
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- 4) Extraction runs + proposals
CREATE TABLE IF NOT EXISTS public.work_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('CHAT_CHANNEL','IMPORT')),
  source_id uuid NOT NULL,
  workspace_id uuid,
  idempotency_key text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','FAILED')),
  error text,
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS work_extraction_runs_source_idx
  ON public.work_extraction_runs(tenant_id, source_type, source_id, created_at DESC);

GRANT SELECT ON public.work_extraction_runs TO authenticated;
GRANT ALL ON public.work_extraction_runs TO service_role;
ALTER TABLE public.work_extraction_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_extraction_runs_select" ON public.work_extraction_runs
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.work_extraction_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.work_extraction_runs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('TASK','DECISION','COMMITMENT','KNOWLEDGE')),
  title text NOT NULL,
  description text,
  evidence text NOT NULL DEFAULT '',
  evidence_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  missing_fields text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DISMISSED')),
  created_entity_type text,
  created_entity_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS work_extraction_proposals_run_idx
  ON public.work_extraction_proposals(run_id, created_at);

GRANT SELECT ON public.work_extraction_proposals TO authenticated;
GRANT ALL ON public.work_extraction_proposals TO service_role;
ALTER TABLE public.work_extraction_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_extraction_proposals_select" ON public.work_extraction_proposals
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- 5) Source citations (created entity -> conversation evidence)
CREATE TABLE IF NOT EXISTS public.work_source_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('TASK','DECISION','KNOWLEDGE','COMMITMENT')),
  entity_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('CHAT_CHANNEL','IMPORT')),
  source_id uuid NOT NULL,
  message_id uuid,
  excerpt text NOT NULL DEFAULT '',
  proposal_id uuid REFERENCES public.work_extraction_proposals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS work_source_citations_entity_idx
  ON public.work_source_citations(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS work_source_citations_source_idx
  ON public.work_source_citations(tenant_id, source_type, source_id);

GRANT SELECT ON public.work_source_citations TO authenticated;
GRANT ALL ON public.work_source_citations TO service_role;
ALTER TABLE public.work_source_citations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_source_citations_select" ON public.work_source_citations
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- 6) Permission helper: can the caller read this conversation source?
CREATE OR REPLACE FUNCTION public.can_access_conversation_source(_source_type text, _source_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean := false;
BEGIN
  IF _source_type = 'CHAT_CHANNEL' THEN
    SELECT public.is_chat_member(_source_id, auth.uid()) INTO _ok;
  ELSIF _source_type = 'IMPORT' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.conversation_imports ci
      WHERE ci.id = _source_id
        AND public.is_tenant_member(ci.tenant_id)
        AND (ci.visibility = 'TENANT' OR ci.imported_by = auth.uid())
    ) INTO _ok;
  END IF;
  RETURN coalesce(_ok, false);
END $$;

REVOKE ALL ON FUNCTION public.can_access_conversation_source(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_conversation_source(text, uuid) TO authenticated, service_role;

-- 7) RPC: create a manual conversation import (idempotent on fingerprint)
CREATE OR REPLACE FUNCTION public.create_conversation_import(
  _tenant_id uuid,
  _workspace_id uuid,
  _source_channel text,
  _source_group_name text,
  _shared_by_label text,
  _original_at timestamptz,
  _visibility text,
  _notes text,
  _fingerprint text,
  _messages jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.conversation_imports;
  _import_id uuid;
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(_messages) <> 'array' OR jsonb_array_length(_messages) = 0 THEN
    RAISE EXCEPTION 'IMPORT_EMPTY' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _existing FROM public.conversation_imports
  WHERE tenant_id = _tenant_id AND fingerprint = _fingerprint;
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('importId', _existing.id, 'duplicate', true,
                              'messageCount', _existing.message_count);
  END IF;

  INSERT INTO public.conversation_imports(
    tenant_id, workspace_id, source_channel, source_group_name, shared_by_label,
    original_at, visibility, notes, fingerprint, imported_by, created_by, updated_by)
  VALUES (_tenant_id, _workspace_id, _source_channel, _source_group_name,
          nullif(btrim(coalesce(_shared_by_label,'')), ''), _original_at,
          coalesce(_visibility,'TENANT'), nullif(btrim(coalesce(_notes,'')), ''),
          _fingerprint, _uid, _uid, _uid)
  RETURNING id INTO _import_id;

  INSERT INTO public.conversation_import_messages(tenant_id, import_id, seq, author_label, sent_at, body, attachments)
  SELECT _tenant_id, _import_id, (ord - 1)::int,
         coalesce(nullif(btrim(m->>'authorLabel'), ''), 'Không rõ'),
         nullif(m->>'sentAt','')::timestamptz,
         coalesce(m->>'body',''),
         coalesce(m->'attachments', '[]'::jsonb)
  FROM jsonb_array_elements(_messages) WITH ORDINALITY AS t(m, ord);

  SELECT count(*) INTO _count FROM public.conversation_import_messages WHERE import_id = _import_id;
  UPDATE public.conversation_imports SET message_count = _count, updated_at = now() WHERE id = _import_id;

  INSERT INTO public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (_tenant_id, _uid, 'CONVERSATION_IMPORT_CREATED', 'CONVERSATION_IMPORT', _import_id,
          jsonb_build_object('channel', _source_channel, 'group', _source_group_name, 'messages', _count));

  RETURN jsonb_build_object('importId', _import_id, 'duplicate', false, 'messageCount', _count);
END $$;

REVOKE ALL ON FUNCTION public.create_conversation_import(uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_conversation_import(uuid,uuid,text,text,text,timestamptz,text,text,text,jsonb) TO authenticated, service_role;

-- 8) RPC: record an extraction run + proposals (idempotent)
CREATE OR REPLACE FUNCTION public.record_extraction_run(
  _tenant_id uuid,
  _source_type text,
  _source_id uuid,
  _workspace_id uuid,
  _idempotency_key text,
  _model text,
  _proposals jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _run_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_access_conversation_source(_source_type, _source_id) THEN
    RAISE EXCEPTION 'CONVERSATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT id INTO _run_id FROM public.work_extraction_runs
  WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF _run_id IS NOT NULL THEN
    RETURN jsonb_build_object('runId', _run_id, 'duplicate', true);
  END IF;

  INSERT INTO public.work_extraction_runs(
    tenant_id, source_type, source_id, workspace_id, idempotency_key, model, requested_by)
  VALUES (_tenant_id, _source_type, _source_id, _workspace_id, _idempotency_key, _model, _uid)
  RETURNING id INTO _run_id;

  INSERT INTO public.work_extraction_proposals(
    tenant_id, run_id, kind, title, description, evidence, evidence_ref, confidence,
    missing_fields, created_by, updated_by)
  SELECT _tenant_id, _run_id,
         upper(coalesce(p->>'kind','TASK')),
         left(coalesce(nullif(btrim(p->>'title'),''), 'Không có tiêu đề'), 500),
         nullif(btrim(coalesce(p->>'description','')), ''),
         coalesce(p->>'evidence',''),
         coalesce(p->'evidenceRef', '{}'::jsonb),
         least(greatest(coalesce((p->>'confidence')::numeric, 0.5), 0), 1),
         coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(coalesce(p->'missingFields','[]'::jsonb))), '{}'),
         _uid, _uid
  FROM jsonb_array_elements(coalesce(_proposals,'[]'::jsonb)) AS p
  WHERE upper(coalesce(p->>'kind','TASK')) IN ('TASK','DECISION','COMMITMENT','KNOWLEDGE');

  INSERT INTO public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (_tenant_id, _uid, 'WORK_EXTRACTION_RUN', 'EXTRACTION_RUN', _run_id,
          jsonb_build_object('sourceType', _source_type, 'sourceId', _source_id));

  RETURN jsonb_build_object('runId', _run_id, 'duplicate', false);
END $$;

REVOKE ALL ON FUNCTION public.record_extraction_run(uuid,text,uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_extraction_run(uuid,text,uuid,uuid,text,text,jsonb) TO authenticated, service_role;

-- 9) RPC: mark a proposal approved and record its citation
CREATE OR REPLACE FUNCTION public.approve_extraction_proposal(
  _proposal_id uuid,
  _entity_type text,
  _entity_id uuid,
  _excerpt text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _p public.work_extraction_proposals;
  _run public.work_extraction_runs;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _p FROM public.work_extraction_proposals WHERE id = _proposal_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_p.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _p.status = 'APPROVED' THEN
    RETURN jsonb_build_object('proposalId', _p.id, 'duplicate', true,
                              'entityId', _p.created_entity_id);
  END IF;

  SELECT * INTO _run FROM public.work_extraction_runs WHERE id = _p.run_id;

  UPDATE public.work_extraction_proposals
  SET status = 'APPROVED', created_entity_type = _entity_type, created_entity_id = _entity_id,
      approved_by = _uid, approved_at = now(), updated_by = _uid, updated_at = now()
  WHERE id = _proposal_id;

  INSERT INTO public.work_source_citations(
    tenant_id, entity_type, entity_id, source_type, source_id, excerpt, proposal_id, created_by)
  VALUES (_p.tenant_id, _entity_type, _entity_id, _run.source_type, _run.source_id,
          coalesce(nullif(btrim(_excerpt),''), _p.evidence), _p.id, _uid);

  INSERT INTO public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (_p.tenant_id, _uid, 'WORK_EXTRACTION_APPROVED', _entity_type, _entity_id,
          jsonb_build_object('proposalId', _p.id, 'sourceType', _run.source_type, 'sourceId', _run.source_id));

  RETURN jsonb_build_object('proposalId', _p.id, 'duplicate', false, 'entityId', _entity_id);
END $$;

REVOKE ALL ON FUNCTION public.approve_extraction_proposal(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_extraction_proposal(uuid,text,uuid,text) TO authenticated, service_role;

-- 10) RPC: dismiss a proposal
CREATE OR REPLACE FUNCTION public.dismiss_extraction_proposal(_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p public.work_extraction_proposals;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _p FROM public.work_extraction_proposals WHERE id = _proposal_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_p.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  UPDATE public.work_extraction_proposals
  SET status = 'DISMISSED', updated_by = _uid, updated_at = now()
  WHERE id = _proposal_id AND status = 'PENDING';
  RETURN jsonb_build_object('proposalId', _proposal_id, 'status', 'DISMISSED');
END $$;

REVOKE ALL ON FUNCTION public.dismiss_extraction_proposal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_extraction_proposal(uuid) TO authenticated, service_role;

-- 11) RPC: read a conversation source (permission aware) for AI + review UI
CREATE OR REPLACE FUNCTION public.get_conversation_source(
  _source_type text, _source_id uuid, _limit integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _res jsonb; _head jsonb;
BEGIN
  IF NOT public.can_access_conversation_source(_source_type, _source_id) THEN
    RAISE EXCEPTION 'CONVERSATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF _source_type = 'IMPORT' THEN
    SELECT jsonb_build_object(
      'sourceType','IMPORT','sourceId', ci.id, 'tenantId', ci.tenant_id,
      'workspaceId', ci.workspace_id, 'title', ci.source_group_name,
      'channel', ci.source_channel, 'ingestMode', ci.ingest_mode,
      'sharedBy', ci.shared_by_label, 'importedBy', ci.imported_by,
      'originalAt', ci.original_at, 'visibility', ci.visibility,
      'messageCount', ci.message_count)
    INTO _head FROM public.conversation_imports ci WHERE ci.id = _source_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'seq', m.seq, 'author', m.author_label,
      'sentAt', m.sent_at, 'body', m.body, 'attachments', m.attachments
    ) ORDER BY m.seq), '[]'::jsonb)
    INTO _res FROM (
      SELECT * FROM public.conversation_import_messages
      WHERE import_id = _source_id ORDER BY seq LIMIT _limit
    ) m;
  ELSE
    SELECT jsonb_build_object(
      'sourceType','CHAT_CHANNEL','sourceId', c.id, 'tenantId', c.tenant_id,
      'workspaceId', c.workspace_id, 'title', c.name, 'channel', 'uniwork',
      'ingestMode','INTERNAL', 'messageCount', 0)
    INTO _head FROM public.chat_channels c WHERE c.id = _source_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'seq', 0, 'author', coalesce(nullif(p.display_name,''), 'Thành viên'),
      'sentAt', m.created_at, 'body', m.body, 'attachments', m.attachments
    ) ORDER BY m.created_at), '[]'::jsonb)
    INTO _res FROM (
      SELECT * FROM public.chat_messages
      WHERE channel_id = _source_id AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT _limit
    ) m LEFT JOIN public.profiles p ON p.id = m.author_id;
  END IF;

  RETURN jsonb_build_object('source', coalesce(_head,'{}'::jsonb), 'messages', coalesce(_res,'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.get_conversation_source(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_source(text,uuid,integer) TO authenticated, service_role;

CREATE TRIGGER conversation_imports_bump_row_version
  BEFORE UPDATE ON public.conversation_imports
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER work_extraction_proposals_bump_row_version
  BEFORE UPDATE ON public.work_extraction_proposals
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER external_messaging_connections_bump_row_version
  BEFORE UPDATE ON public.external_messaging_connections
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

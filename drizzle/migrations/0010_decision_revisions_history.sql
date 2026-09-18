-- Lịch sử thay đổi Quyết định: bảng append-only, mỗi lần thay đổi ghi 1 phiên bản.
CREATE TABLE public.decision_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  row_version integer NOT NULL,
  change_kind text NOT NULL CHECK (change_kind IN ('CREATED','UPDATED')),
  changed_fields text[] NOT NULL DEFAULT '{}',
  snapshot jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, row_version)
);

CREATE INDEX idx_decision_revisions_tenant_time
  ON public.decision_revisions (tenant_id, changed_at DESC);
CREATE INDEX idx_decision_revisions_decision
  ON public.decision_revisions (decision_id, row_version DESC);

GRANT SELECT ON public.decision_revisions TO authenticated;
GRANT ALL ON public.decision_revisions TO service_role;

ALTER TABLE public.decision_revisions ENABLE ROW LEVEL SECURITY;

-- Chỉ thành viên tổ chức đọc được; không ai ghi trực tiếp (chỉ trigger security definer).
CREATE POLICY "decision_revisions_select_tenant_member"
  ON public.decision_revisions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.tg_decision_record_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _fields text[] := '{}'; _kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _kind := 'CREATED';
  ELSE
    _kind := 'UPDATED';
    IF NEW.title IS DISTINCT FROM OLD.title THEN _fields := _fields || 'title'; END IF;
    IF NEW.detail IS DISTINCT FROM OLD.detail THEN _fields := _fields || 'detail'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN _fields := _fields || 'status'; END IF;
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN _fields := _fields || 'workspace_id'; END IF;
    IF NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN _fields := _fields || 'decided_at'; END IF;
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN _fields := _fields || 'confirmed_at'; END IF;
    IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by THEN _fields := _fields || 'confirmed_by'; END IF;
    IF NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN _fields := _fields || 'superseded_by'; END IF;
    IF NEW.evidence IS DISTINCT FROM OLD.evidence THEN _fields := _fields || 'evidence'; END IF;
    IF array_length(_fields, 1) IS NULL THEN RETURN NEW; END IF;
  END IF;

  INSERT INTO public.decision_revisions (
    tenant_id, decision_id, row_version, change_kind, changed_fields, snapshot, changed_by)
  VALUES (
    NEW.tenant_id, NEW.id, NEW.row_version, _kind, _fields,
    jsonb_build_object(
      'title', NEW.title, 'detail', NEW.detail, 'status', NEW.status,
      'origin', NEW.origin, 'sourceType', NEW.source_type, 'sourceId', NEW.source_id,
      'workspaceId', NEW.workspace_id, 'decidedAt', NEW.decided_at,
      'confirmedAt', NEW.confirmed_at, 'confirmedBy', NEW.confirmed_by,
      'supersededBy', NEW.superseded_by, 'evidence', NEW.evidence),
    COALESCE(NEW.updated_by, NEW.created_by))
  ON CONFLICT (decision_id, row_version) DO NOTHING;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_decision_record_revision
AFTER INSERT OR UPDATE ON public.decisions
FOR EACH ROW EXECUTE FUNCTION public.tg_decision_record_revision();

-- Baseline: ghi phiên bản hiện tại cho các quyết định đã tồn tại (không sửa dữ liệu nguồn).
INSERT INTO public.decision_revisions (
  tenant_id, decision_id, row_version, change_kind, changed_fields, snapshot, changed_by, changed_at)
SELECT d.tenant_id, d.id, d.row_version, 'CREATED', '{}',
  jsonb_build_object(
    'title', d.title, 'detail', d.detail, 'status', d.status,
    'origin', d.origin, 'sourceType', d.source_type, 'sourceId', d.source_id,
    'workspaceId', d.workspace_id, 'decidedAt', d.decided_at,
    'confirmedAt', d.confirmed_at, 'confirmedBy', d.confirmed_by,
    'supersededBy', d.superseded_by, 'evidence', d.evidence),
  COALESCE(d.updated_by, d.created_by), d.updated_at
FROM public.decisions d
ON CONFLICT (decision_id, row_version) DO NOTHING;
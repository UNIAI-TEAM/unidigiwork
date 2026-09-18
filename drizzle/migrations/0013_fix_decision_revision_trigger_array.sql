CREATE OR REPLACE FUNCTION public.tg_decision_record_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _fields text[] := '{}'::text[]; _kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _kind := 'CREATED';
  ELSE
    _kind := 'UPDATED';
    IF NEW.title IS DISTINCT FROM OLD.title THEN _fields := _fields || 'title'::text; END IF;
    IF NEW.detail IS DISTINCT FROM OLD.detail THEN _fields := _fields || 'detail'::text; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN _fields := _fields || 'status'::text; END IF;
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN _fields := _fields || 'workspace_id'::text; END IF;
    IF NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN _fields := _fields || 'decided_at'::text; END IF;
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN _fields := _fields || 'confirmed_at'::text; END IF;
    IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by THEN _fields := _fields || 'confirmed_by'::text; END IF;
    IF NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN _fields := _fields || 'superseded_by'::text; END IF;
    IF NEW.evidence IS DISTINCT FROM OLD.evidence THEN _fields := _fields || 'evidence'::text; END IF;
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
END $function$;
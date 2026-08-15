-- Audit child-entity changes for Task and Document (assign/comment/share/version)
CREATE OR REPLACE FUNCTION public.audit_child_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _res text := TG_ARGV[0];          -- 'task' | 'document'
  _child text := TG_ARGV[1];        -- 'assignee' | 'comment' | 'permission' | 'version'
  _parent_col text := TG_ARGV[2];   -- 'task_id' | 'document_id'
  _actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.actor_id', true), '')::uuid);
  _corr text := NULLIF(current_setting('app.correlation_id', true), '');
  _row jsonb;
  _before jsonb;
  _after jsonb;
  _tenant uuid;
  _rid text;
  _verb text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _row := to_jsonb(NEW); _after := _row; _verb := _child || '_added';
  ELSIF TG_OP = 'UPDATE' THEN
    _before := to_jsonb(OLD); _after := to_jsonb(NEW); _row := _after;
    IF _before = _after THEN RETURN NULL; END IF;
    IF (_before ->> 'deleted_at') IS NULL AND (_after ->> 'deleted_at') IS NOT NULL THEN
      _verb := _child || '_removed';
    ELSE
      _verb := _child || '_updated';
    END IF;
  ELSE
    _before := to_jsonb(OLD); _row := _before; _verb := _child || '_removed';
  END IF;

  _rid := _row ->> _parent_col;
  _tenant := NULLIF(_row ->> 'tenant_id', '')::uuid;

  IF _actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = _actor) THEN
    _actor := NULL;
  END IF;
  IF _tenant IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN
    _tenant := NULL;
  END IF;

  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, actor_id, action, event_type,
    resource_type, resource_id, aggregate_type, aggregate_id,
    before_state, after_state, payload, source, correlation_id, occurred_at
  ) VALUES (
    _tenant, _actor, _actor,
    _res || '.' || _verb, _res || '.' || _verb,
    _res, _rid, _res, _rid,
    _before, _after,
    jsonb_build_object('op', TG_OP, 'verb', _verb, 'child', _child),
    'app', _corr, now()
  );
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_audit_task_assignees ON public.task_assignees;
CREATE TRIGGER trg_audit_task_assignees
AFTER INSERT OR UPDATE OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.audit_child_row_change('task', 'assignee', 'task_id');

DROP TRIGGER IF EXISTS trg_audit_task_comments ON public.task_comments;
CREATE TRIGGER trg_audit_task_comments
AFTER INSERT OR UPDATE OR DELETE ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.audit_child_row_change('task', 'comment', 'task_id');

DROP TRIGGER IF EXISTS trg_audit_document_permissions ON public.document_permissions;
CREATE TRIGGER trg_audit_document_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.document_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_child_row_change('document', 'permission', 'document_id');

DROP TRIGGER IF EXISTS trg_audit_document_versions ON public.document_versions;
CREATE TRIGGER trg_audit_document_versions
AFTER INSERT OR UPDATE OR DELETE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.audit_child_row_change('document', 'version', 'document_id');

CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON public.audit_events (resource_type, resource_id, occurred_at DESC);
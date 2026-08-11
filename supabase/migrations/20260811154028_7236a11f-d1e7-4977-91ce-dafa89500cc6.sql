CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res text := TG_ARGV[0];
  _actor uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.actor_id', true), '')::uuid);
  _before jsonb;
  _after jsonb;
  _tenant uuid;
  _rid text;
  _verb text;
  _corr text := NULLIF(current_setting('app.correlation_id', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    _after := to_jsonb(NEW); _tenant := NEW.tenant_id; _rid := NEW.id::text; _verb := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    _before := to_jsonb(OLD); _after := to_jsonb(NEW); _tenant := NEW.tenant_id; _rid := NEW.id::text;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _verb := CASE WHEN _res = 'document' THEN 'archived' ELSE 'deleted' END;
    ELSIF _res = 'task' AND (to_jsonb(OLD) ->> 'status') IS DISTINCT FROM (to_jsonb(NEW) ->> 'status') THEN
      _verb := 'status_changed';
    ELSE
      _verb := 'updated';
    END IF;
    IF _before = _after THEN RETURN NULL; END IF;
  ELSE
    _before := to_jsonb(OLD); _tenant := OLD.tenant_id; _rid := OLD.id::text; _verb := 'hard_deleted';
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
    jsonb_build_object('op', TG_OP, 'verb', _verb),
    'app', _corr, now()
  );
  RETURN NULL;
END $$;
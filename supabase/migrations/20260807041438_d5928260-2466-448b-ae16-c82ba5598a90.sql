CREATE OR REPLACE FUNCTION public.repair_workflow_run_timestamps(_run_ids uuid[])
RETURNS TABLE(id uuid, started_at timestamptz, ended_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := now();
BEGIN
  FOR r IN
    SELECT wr.id, wr.tenant_id, wr.started_at, wr.ended_at, wr.created_at
    FROM public.workflow_runs wr
    WHERE wr.id = ANY(_run_ids)
  LOOP
    IF NOT public.is_tenant_member(r.tenant_id) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    v_start := COALESCE(r.started_at, r.created_at);
    IF v_start > v_now THEN v_start := v_now; END IF;
    IF v_start < r.created_at THEN v_start := r.created_at; END IF;

    v_end := r.ended_at;
    IF v_end IS NOT NULL THEN
      IF v_end > v_now THEN v_end := v_now; END IF;
      IF v_end < v_start THEN v_end := v_start; END IF;
    END IF;

    UPDATE public.workflow_runs wr
       SET started_at = v_start,
           ended_at = v_end,
           updated_at = v_now,
           row_version = wr.row_version + 1
     WHERE wr.id = r.id
       AND (wr.started_at IS DISTINCT FROM v_start OR wr.ended_at IS DISTINCT FROM v_end);

    IF FOUND THEN
      id := r.id; started_at := v_start; ended_at := v_end;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_workflow_run_timestamps(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_workflow_run_timestamps(uuid[]) TO authenticated;
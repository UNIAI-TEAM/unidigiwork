CREATE TABLE public.work_execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  execution_id uuid NOT NULL REFERENCES public.ai_task_executions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  seq integer NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  title text NOT NULL,
  detail text,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_execution_steps_kind_chk CHECK (kind IN ('CONTEXT','PLAN','GENERATE','ACTION','VALIDATE','REVIEW')),
  CONSTRAINT work_execution_steps_status_chk CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED','AWAITING_CONFIRMATION')),
  CONSTRAINT work_execution_steps_unique_seq UNIQUE (execution_id, seq)
);

CREATE INDEX work_execution_steps_execution_idx ON public.work_execution_steps (execution_id, seq);
CREATE INDEX work_execution_steps_task_idx ON public.work_execution_steps (task_id, created_at DESC);

GRANT SELECT ON public.work_execution_steps TO authenticated;
GRANT ALL ON public.work_execution_steps TO service_role;

ALTER TABLE public.work_execution_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_execution_steps_select ON public.work_execution_steps
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = work_execution_steps.task_id AND t.deleted_at IS NULL)
  );

CREATE TRIGGER work_execution_steps_updated_at
  BEFORE UPDATE ON public.work_execution_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ghi/nâng cấp một bước thực thi. SECURITY DEFINER nhưng luôn xác thực:
-- (1) lượt chạy tồn tại, (2) người gọi là thành viên tổ chức của lượt chạy đó.
CREATE OR REPLACE FUNCTION public.record_work_execution_step(
  _execution_id uuid,
  _seq integer,
  _kind text,
  _status text,
  _title text,
  _detail text DEFAULT NULL,
  _output jsonb DEFAULT '{}'::jsonb,
  _error_code text DEFAULT NULL
)
RETURNS public.work_execution_steps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exec public.ai_task_executions;
  _row public.work_execution_steps;
BEGIN
  SELECT * INTO _exec FROM public.ai_task_executions WHERE id = _execution_id;
  IF _exec.id IS NULL THEN
    RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_tenant_member(_exec.tenant_id) THEN
    RAISE EXCEPTION 'AI_EXECUTION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF _kind NOT IN ('CONTEXT','PLAN','GENERATE','ACTION','VALIDATE','REVIEW') THEN
    RAISE EXCEPTION 'WORK_STEP_KIND_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  -- Chỉ bước ACTION được phép dừng ở AWAITING_CONFIRMATION.
  IF _status = 'AWAITING_CONFIRMATION' AND _kind <> 'ACTION' THEN
    RAISE EXCEPTION 'WORK_STEP_STATUS_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.work_execution_steps AS s (
    tenant_id, workspace_id, execution_id, task_id, seq, kind, status,
    title, detail, output, error_code,
    started_at, completed_at
  ) VALUES (
    _exec.tenant_id, _exec.workspace_id, _exec.id, _exec.task_id, _seq, _kind, _status,
    _title, _detail, COALESCE(_output, '{}'::jsonb), _error_code,
    CASE WHEN _status = 'PENDING' THEN NULL ELSE now() END,
    CASE WHEN _status IN ('SUCCEEDED','FAILED','SKIPPED') THEN now() ELSE NULL END
  )
  ON CONFLICT (execution_id, seq) DO UPDATE SET
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    detail = COALESCE(EXCLUDED.detail, s.detail),
    output = CASE WHEN EXCLUDED.output = '{}'::jsonb THEN s.output ELSE EXCLUDED.output END,
    error_code = EXCLUDED.error_code,
    started_at = COALESCE(s.started_at, EXCLUDED.started_at),
    completed_at = EXCLUDED.completed_at
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_work_execution_step(uuid, integer, text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_work_execution_step(uuid, integer, text, text, text, text, jsonb, text) TO authenticated;
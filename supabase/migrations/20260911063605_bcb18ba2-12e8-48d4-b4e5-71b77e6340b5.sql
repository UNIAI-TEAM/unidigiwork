ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS department text;
CREATE INDEX IF NOT EXISTS meetings_tenant_department_idx ON public.meetings (tenant_id, department);
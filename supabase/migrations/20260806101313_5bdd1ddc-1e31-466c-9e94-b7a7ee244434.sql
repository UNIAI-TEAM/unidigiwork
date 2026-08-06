CREATE TABLE public.demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  source text NOT NULL DEFAULT 'landing_hybrid',
  status text NOT NULL DEFAULT 'new',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_demo_requests_status ON public.demo_requests(status);
CREATE INDEX idx_demo_requests_created_at ON public.demo_requests(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_requests TO authenticated;
GRANT INSERT ON public.demo_requests TO anon;
GRANT ALL ON public.demo_requests TO service_role;

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_can_submit_demo_request" ON public.demo_requests
FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY "authenticated_can_read_demo_requests" ON public.demo_requests
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "service_role_can_manage_demo_requests" ON public.demo_requests
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER trg_demo_requests_updated_at
BEFORE UPDATE ON public.demo_requests
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
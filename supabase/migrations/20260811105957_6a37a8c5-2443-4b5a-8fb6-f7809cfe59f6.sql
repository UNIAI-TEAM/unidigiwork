CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  plan_name text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'VND',
  status text NOT NULL DEFAULT 'open',
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  payment_method text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft','open','paid','past_due','refunded','void'))
);

CREATE INDEX invoices_tenant_issued_idx ON public.invoices (tenant_id, issued_at DESC);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_read_tenant" ON public.invoices
FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER invoices_set_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.invoices (tenant_id, subscription_id, plan_id, invoice_number, plan_name, amount, currency, status, period_start, period_end, issued_at, due_at, paid_at, payment_method)
SELECT s.tenant_id, s.id, s.plan_id,
       'INV-' || to_char(now() - (g.n || ' month')::interval, 'YYYYMM') || '-' || upper(substr(replace(s.tenant_id::text,'-',''),1,6)),
       p.name,
       COALESCE(p.price_amount, 0),
       COALESCE(p.price_currency, 'VND'),
       CASE WHEN g.n = 0 THEN 'open' ELSE 'paid' END,
       date_trunc('month', now() - (g.n || ' month')::interval),
       date_trunc('month', now() - (g.n || ' month')::interval) + interval '1 month',
       date_trunc('month', now() - (g.n || ' month')::interval),
       date_trunc('month', now() - (g.n || ' month')::interval) + interval '7 day',
       CASE WHEN g.n = 0 THEN NULL ELSE date_trunc('month', now() - (g.n || ' month')::interval) + interval '2 day' END,
       CASE WHEN g.n = 0 THEN NULL ELSE 'Chuyển khoản ngân hàng' END
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
CROSS JOIN generate_series(0, 2) AS g(n)
WHERE s.status <> 'canceled';
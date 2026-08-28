-- SWP-2 — Commercial Pilot & Work Product Economics Proof
-- Chỉ thêm lớp THƯƠNG MẠI. Không tạo engine thực thi/chất lượng/kinh tế song song.

CREATE TABLE public.sell_work_pilots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_segment text,
  industry text,
  start_date date NOT NULL DEFAULT current_date,
  target_end_date date,
  status text NOT NULL DEFAULT 'PROSPECT'
    CHECK (status IN ('PROSPECT','QUALIFIED','ONBOARDING','ACTIVE_PILOT','VALUE_PROVEN','PAID_PILOT','REPEAT_USAGE','EXPANSION_SIGNAL','PAUSED','LOST')),
  pilot_owner uuid,
  success_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_model text CHECK (commercial_model IN ('PER_EXECUTION','PER_ACCEPTED_OUTCOME','MONTHLY_BUNDLE','SUBSCRIPTION_INCLUDED','CUSTOM')),
  contract_value numeric,
  currency text CHECK (currency IN ('USD','VND','EUR')),
  wtp_signal text NOT NULL DEFAULT 'NO_SIGNAL'
    CHECK (wtp_signal IN ('NO_SIGNAL','INTERESTED','WILL_PAY_AT_RIGHT_PRICE','PAID_PILOT','CONTRACTED')),
  wtp_amount numeric,
  wtp_currency text CHECK (wtp_currency IN ('USD','VND','EUR')),
  wtp_billing_basis text,
  paid_verified_by uuid,
  paid_verified_at timestamptz,
  paid_evidence_reference text,
  activated_at timestamptz,
  last_active_at timestamptz,
  lost_primary_reason text CHECK (lost_primary_reason IN ('NO_ACTIVATION','INSUFFICIENT_CONTEXT','LOW_QUALITY','TOO_MUCH_HUMAN_WORK','NO_REPEAT_USAGE','NO_VERIFIED_VALUE','PRICE_REJECTION','INTEGRATION_BLOCKER','CUSTOMER_PRIORITY_CHANGED','OTHER')),
  lost_secondary_reason text,
  commercial_feedback text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_swp_pilots_tenant ON public.sell_work_pilots(tenant_id);
CREATE INDEX idx_swp_pilots_status ON public.sell_work_pilots(status);

CREATE TABLE public.sell_work_pilot_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.sell_work_pilots(id) ON DELETE CASCADE,
  work_unit_code text NOT NULL,
  work_unit_version integer NOT NULL DEFAULT 1,
  expected_user_group text,
  expected_frequency text CHECK (expected_frequency IN ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','AD_HOC')),
  target_problem text,
  expected_deliverable text,
  success_criteria text,
  measurable_outcome text,
  commercial_hypothesis text,
  activated_at timestamptz,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','PAUSED','DROPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pilot_id, work_unit_code, work_unit_version)
);
CREATE INDEX idx_swp_pilot_products_pilot ON public.sell_work_pilot_products(pilot_id);

CREATE TABLE public.sell_work_commercial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.sell_work_pilots(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('PILOT_CREATED','PILOT_ACTIVATED','WORK_PRODUCT_ACTIVATED','FIRST_EXECUTION','FIRST_ACCEPTED_WORK','REPEAT_EXECUTION','VALUE_CONFIRMED','PRICE_DISCUSSION_STARTED','PAID_PILOT_CONFIRMED','EXPANSION_DISCUSSION','PILOT_LOST','STATUS_CHANGED')),
  work_unit_code text,
  work_unit_version integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_swp_events_pilot ON public.sell_work_commercial_events(pilot_id, occurred_at DESC);

CREATE TABLE public.sell_work_pricing_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.sell_work_pilots(id) ON DELETE CASCADE,
  work_unit_code text NOT NULL,
  work_unit_version integer NOT NULL DEFAULT 1,
  pricing_basis text NOT NULL CHECK (pricing_basis IN ('PER_EXECUTION','PER_ACCEPTED_OUTCOME','MONTHLY_BUNDLE','SUBSCRIPTION_INCLUDED','CUSTOM')),
  price numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD','VND','EUR')),
  included_volume integer,
  overage_price numeric,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  customer_response text NOT NULL DEFAULT 'NO_RESPONSE' CHECK (customer_response IN ('ACCEPTED','NEGOTIATING','REJECTED','NO_RESPONSE')),
  responded_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_swp_pricing_pilot ON public.sell_work_pricing_experiments(pilot_id);

CREATE TABLE public.sell_work_pilot_support (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.sell_work_pilots(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('PRODUCT_SUPPORT','DATA_SETUP','TRAINING','BUG','CUSTOM_CONFIG','CUSTOM_ENGINEERING')),
  minutes integer,
  summary text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_swp_support_pilot ON public.sell_work_pilot_support(pilot_id);

CREATE TABLE public.sell_work_revenue_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.sell_work_pilots(id) ON DELETE CASCADE,
  revenue_class text NOT NULL CHECK (revenue_class IN ('PILOT_FEE','SUBSCRIPTION','WORK_PRODUCT_FEE','SERVICES','OTHER')),
  revenue_group text NOT NULL CHECK (revenue_group IN ('SOFTWARE','SELL_WORK','SERVICES')),
  amount numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD','VND','EUR')),
  period_start date,
  period_end date,
  verified_by uuid,
  verified_at timestamptz,
  evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_swp_revenue_pilot ON public.sell_work_revenue_records(pilot_id);

GRANT SELECT ON public.sell_work_pilots TO authenticated;
GRANT SELECT ON public.sell_work_pilot_products TO authenticated;
GRANT SELECT ON public.sell_work_commercial_events TO authenticated;
GRANT SELECT ON public.sell_work_pricing_experiments TO authenticated;
GRANT SELECT ON public.sell_work_pilot_support TO authenticated;
GRANT SELECT ON public.sell_work_revenue_records TO authenticated;
GRANT ALL ON public.sell_work_pilots TO service_role;
GRANT ALL ON public.sell_work_pilot_products TO service_role;
GRANT ALL ON public.sell_work_commercial_events TO service_role;
GRANT ALL ON public.sell_work_pricing_experiments TO service_role;
GRANT ALL ON public.sell_work_pilot_support TO service_role;
GRANT ALL ON public.sell_work_revenue_records TO service_role;

ALTER TABLE public.sell_work_pilots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sell_work_pilot_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sell_work_commercial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sell_work_pricing_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sell_work_pilot_support ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sell_work_revenue_records ENABLE ROW LEVEL SECURITY;

-- Chỉ metadata thương mại: quản trị nền tảng đọc; không mở nội dung công việc khách hàng.
CREATE POLICY swp_pilots_read ON public.sell_work_pilots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY swp_pilot_products_read ON public.sell_work_pilot_products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY swp_events_read ON public.sell_work_commercial_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY swp_pricing_read ON public.sell_work_pricing_experiments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY swp_support_read ON public.sell_work_pilot_support FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY swp_revenue_read ON public.sell_work_revenue_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
-- Ghi: chỉ qua RPC SECURITY DEFINER (không có policy INSERT/UPDATE/DELETE).

CREATE TRIGGER trg_swp_pilots_updated BEFORE UPDATE ON public.sell_work_pilots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_swp_pilot_products_updated BEFORE UPDATE ON public.sell_work_pilot_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_swp_pricing_updated BEFORE UPDATE ON public.sell_work_pricing_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

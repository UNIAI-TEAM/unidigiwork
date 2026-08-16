CREATE TABLE IF NOT EXISTS public.ai_context_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  request_id text NOT NULL,
  operation text NOT NULL DEFAULT 'BUILD',
  strategy text,
  root_entity_type text,
  estimated_tokens integer NOT NULL DEFAULT 0,
  max_tokens integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  partial boolean NOT NULL DEFAULT false,
  latency_ms integer NOT NULL DEFAULT 0,
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_context_metrics TO authenticated;
GRANT ALL ON public.ai_context_metrics TO service_role;

ALTER TABLE public.ai_context_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_context_metrics_insert_own" ON public.ai_context_metrics
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_context_metrics_select_own" ON public.ai_context_metrics
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "ai_context_metrics_select_admin" ON public.ai_context_metrics
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_context_metrics_created_idx ON public.ai_context_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_context_metrics_tenant_idx ON public.ai_context_metrics (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_ai_context_budget_metrics(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT *
    FROM public.ai_context_metrics m
    WHERE public.has_role(auth.uid(), 'admin')
      AND m.created_at >= now() - make_interval(hours => greatest(1, least(coalesce(_hours, 24), 720))))
  SELECT jsonb_build_object(
    'windowHours', greatest(1, least(coalesce(_hours, 24), 720)),
    'requestCount', (SELECT count(*) FROM scoped),
    'truncatedRate', (SELECT coalesce(avg(CASE WHEN truncated THEN 1 ELSE 0 END), 0) FROM scoped),
    'partialRate', (SELECT coalesce(avg(CASE WHEN partial THEN 1 ELSE 0 END), 0) FROM scoped),
    'avgSources', (SELECT coalesce(avg(source_count), 0) FROM scoped),
    'tokens', (SELECT jsonb_build_object(
        'p50', coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY estimated_tokens), 0),
        'p95', coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY estimated_tokens), 0),
        'p99', coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY estimated_tokens), 0),
        'max', coalesce(max(estimated_tokens), 0)) FROM scoped),
    'latencyMs', (SELECT jsonb_build_object(
        'p50', coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0),
        'p95', coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0),
        'p99', coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms), 0),
        'max', coalesce(max(latency_ms), 0)) FROM scoped),
    'byOperation', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT operation,
               count(*) AS count,
               coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY estimated_tokens), 0) AS tokens_p50,
               coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY estimated_tokens), 0) AS tokens_p95,
               coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS latency_p95
        FROM scoped GROUP BY operation ORDER BY count(*) DESC) x)
  );
$$;

REVOKE ALL ON FUNCTION public.get_ai_context_budget_metrics(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_ai_context_budget_metrics(integer) TO authenticated;
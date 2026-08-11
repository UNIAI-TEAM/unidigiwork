GRANT SELECT ON public.plans TO anon, authenticated;
GRANT SELECT ON public.plan_features TO anon, authenticated;
GRANT SELECT ON public.features TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
GRANT ALL ON public.plan_features TO service_role;
GRANT ALL ON public.features TO service_role;
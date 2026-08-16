GRANT EXECUTE ON FUNCTION public.work_graph_backfill(integer, boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.work_graph_health() TO postgres;
GRANT EXECUTE ON FUNCTION public._work_graph_link_system(text, uuid, text, uuid, text, jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public._work_graph_reconcile_single(text, uuid, text, uuid, text) TO postgres;
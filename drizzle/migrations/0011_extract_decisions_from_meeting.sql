CREATE OR REPLACE FUNCTION public.extract_decisions_from_meeting(_meeting_id uuid)
RETURNS TABLE(created integer, skipped integer, total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  s record;
  el jsonb;
  item_key text;
  ins_id uuid;
  c integer := 0;
  t integer := 0;
BEGIN
  SELECT id, tenant_id, workspace_id, start_at INTO m
    FROM public.meetings WHERE id = _meeting_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_tenant_member(m.tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, decisions, generated_at, model INTO s
    FROM public.meeting_summaries WHERE meeting_id = _meeting_id;
  IF s.tenant_id IS NULL THEN
    RAISE EXCEPTION 'SUMMARY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR el IN SELECT * FROM jsonb_array_elements(COALESCE(s.decisions, '[]'::jsonb)) LOOP
    CONTINUE WHEN COALESCE(btrim(el->>'title'), '') = '';
    t := t + 1;
    item_key := COALESCE(NULLIF(el->>'itemKey', ''), md5(lower(btrim(el->>'title'))));
    ins_id := NULL;

    INSERT INTO public.decisions (
      tenant_id, workspace_id, title, detail, status, origin,
      source_type, source_id, source_ref, evidence, decided_at, created_at)
    VALUES (
      m.tenant_id, m.workspace_id,
      left(btrim(el->>'title'), 200),
      NULLIF(btrim(COALESCE(el->>'detail', '')), ''),
      'CANDIDATE', 'MEETING',
      'MEETING', m.id,
      'summary:' || m.id::text || ':' || item_key,
      jsonb_build_object(
        'meetingId', m.id,
        'itemKey', item_key,
        'confidence', el->>'confidence',
        'sourceIds', COALESCE(el->'sourceIds', '[]'::jsonb),
        'model', s.model,
        'generatedAt', s.generated_at,
        'extractedFrom', 'MEETING_SUMMARY'),
      COALESCE(m.start_at, s.generated_at), now())
    ON CONFLICT (tenant_id, origin, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
    RETURNING id INTO ins_id;

    IF ins_id IS NOT NULL THEN
      c := c + 1;
      INSERT INTO public.decision_links (
        tenant_id, decision_id, source_type, source_id, relationship, status, evidence)
      SELECT m.tenant_id, ins_id, 'MEETING_ARTIFACT', ai.id, 'REALIZED_AS', 'CANDIDATE',
             jsonb_build_object('rule', 'SAME_MEETING', 'meetingId', m.id, 'actionItemKey', ai.item_key)
        FROM public.meeting_artifacts ai
       WHERE ai.meeting_id = m.id AND ai.kind = 'ACTION_ITEM' AND ai.tenant_id = m.tenant_id
      ON CONFLICT (tenant_id, decision_id, source_type, source_id, relationship) DO NOTHING;
    END IF;
  END LOOP;

  RETURN QUERY SELECT c, t - c, t;
END $function$;

REVOKE ALL ON FUNCTION public.extract_decisions_from_meeting(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.extract_decisions_from_meeting(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extract_decisions_from_meeting(uuid) TO service_role;
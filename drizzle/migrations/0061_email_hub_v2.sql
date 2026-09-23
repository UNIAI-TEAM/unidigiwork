CREATE TABLE IF NOT EXISTS public.email_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS email_labels_tenant_name_uq
  ON public.email_labels (tenant_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_labels TO authenticated;
GRANT ALL ON public.email_labels TO service_role;
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_labels_select ON public.email_labels;
CREATE POLICY email_labels_select ON public.email_labels FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS email_labels_write ON public.email_labels;
CREATE POLICY email_labels_write ON public.email_labels FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.email_message_labels (
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (message_id, label_id)
);
CREATE INDEX IF NOT EXISTS email_message_labels_label_idx
  ON public.email_message_labels (label_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_message_labels TO authenticated;
GRANT ALL ON public.email_message_labels TO service_role;
ALTER TABLE public.email_message_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_message_labels_all ON public.email_message_labels;
CREATE POLICY email_message_labels_all ON public.email_message_labels FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.email_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  cond_from text,
  cond_subject_contains text,
  cond_has_attachment boolean NOT NULL DEFAULT false,
  act_label_id uuid REFERENCES public.email_labels(id) ON DELETE SET NULL,
  act_folder text,
  act_mark_read boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT email_rules_folder_chk
    CHECK (act_folder IS NULL OR act_folder IN ('inbox', 'archive', 'trash'))
);
CREATE INDEX IF NOT EXISTS email_rules_user_idx ON public.email_rules (user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_rules TO authenticated;
GRANT ALL ON public.email_rules TO service_role;
ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_rules_own ON public.email_rules;
CREATE POLICY email_rules_own ON public.email_rules FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id))
  WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  storage_provider text NOT NULL DEFAULT 'supabase',
  bucket text NOT NULL DEFAULT 'email-attachments',
  object_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS email_attachments_message_idx
  ON public.email_attachments (message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_attachments TO authenticated;
GRANT ALL ON public.email_attachments TO service_role;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_attachments_select ON public.email_attachments;
CREATE POLICY email_attachments_select ON public.email_attachments FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.email_states es
        WHERE es.message_id = email_attachments.message_id AND es.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.email_messages m
        WHERE m.id = email_attachments.message_id AND m.from_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS email_attachments_write ON public.email_attachments;
CREATE POLICY email_attachments_write ON public.email_attachments FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.email_messages m
      WHERE m.id = email_attachments.message_id AND m.from_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.email_messages m
      WHERE m.id = email_attachments.message_id AND m.from_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.email_signatures (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  body text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_signatures TO authenticated;
GRANT ALL ON public.email_signatures TO service_role;
ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_signatures_own ON public.email_signatures;
CREATE POLICY email_signatures_own ON public.email_signatures FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.upsert_email_label(
  _tenant_id uuid, _id uuid, _name text, _color text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(btrim(_name), '') = '' THEN RAISE EXCEPTION 'LABEL_NAME_REQUIRED'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.email_labels (tenant_id, name, color, created_by, updated_by)
    VALUES (_tenant_id, btrim(_name), coalesce(_color, '#2563eb'), auth.uid(), auth.uid())
    ON CONFLICT (tenant_id, lower(name))
      DO UPDATE SET color = EXCLUDED.color, updated_at = now(), updated_by = auth.uid()
    RETURNING id INTO _out;
  ELSE
    UPDATE public.email_labels
       SET name = btrim(_name), color = coalesce(_color, color),
           row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
     WHERE id = _id AND tenant_id = _tenant_id
    RETURNING id INTO _out;
    IF _out IS NULL THEN RAISE EXCEPTION 'LABEL_NOT_FOUND'; END IF;
  END IF;
  RETURN _out;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_email_label(_tenant_id uuid, _id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.email_labels WHERE id = _id AND tenant_id = _tenant_id;
  RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.apply_email_labels(_message_id uuid, _label_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT m.tenant_id INTO _tenant
  FROM public.email_messages m
  WHERE m.id = _message_id
    AND (m.from_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.email_states es
                 WHERE es.message_id = m.id AND es.user_id = auth.uid()));
  IF _tenant IS NULL THEN RAISE EXCEPTION 'MESSAGE_NOT_FOUND'; END IF;
  IF NOT public.is_tenant_member(_tenant) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  DELETE FROM public.email_message_labels WHERE message_id = _message_id;
  INSERT INTO public.email_message_labels (message_id, label_id, tenant_id, created_by)
  SELECT _message_id, l.id, _tenant, auth.uid()
  FROM public.email_labels l
  WHERE l.tenant_id = _tenant AND l.id = ANY(coalesce(_label_ids, '{}'::uuid[]))
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.upsert_email_rule(
  _tenant_id uuid, _id uuid, _name text, _is_enabled boolean,
  _cond_from text, _cond_subject_contains text, _cond_has_attachment boolean,
  _act_label_id uuid, _act_folder text, _act_mark_read boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(btrim(_name), '') = '' THEN RAISE EXCEPTION 'RULE_NAME_REQUIRED'; END IF;
  IF _act_label_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.email_labels WHERE id = _act_label_id AND tenant_id = _tenant_id
  ) THEN RAISE EXCEPTION 'LABEL_NOT_FOUND'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.email_rules (
      tenant_id, user_id, name, is_enabled, cond_from, cond_subject_contains,
      cond_has_attachment, act_label_id, act_folder, act_mark_read, created_by, updated_by
    ) VALUES (
      _tenant_id, auth.uid(), btrim(_name), coalesce(_is_enabled, true),
      nullif(btrim(coalesce(_cond_from, '')), ''),
      nullif(btrim(coalesce(_cond_subject_contains, '')), ''),
      coalesce(_cond_has_attachment, false), _act_label_id,
      nullif(_act_folder, ''), coalesce(_act_mark_read, false), auth.uid(), auth.uid()
    ) RETURNING id INTO _out;
  ELSE
    UPDATE public.email_rules SET
      name = btrim(_name),
      is_enabled = coalesce(_is_enabled, is_enabled),
      cond_from = nullif(btrim(coalesce(_cond_from, '')), ''),
      cond_subject_contains = nullif(btrim(coalesce(_cond_subject_contains, '')), ''),
      cond_has_attachment = coalesce(_cond_has_attachment, false),
      act_label_id = _act_label_id,
      act_folder = nullif(_act_folder, ''),
      act_mark_read = coalesce(_act_mark_read, false),
      row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
    WHERE id = _id AND user_id = auth.uid() AND tenant_id = _tenant_id
    RETURNING id INTO _out;
    IF _out IS NULL THEN RAISE EXCEPTION 'RULE_NOT_FOUND'; END IF;
  END IF;
  RETURN _out;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_email_rule(_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  DELETE FROM public.email_rules WHERE id = _id AND user_id = auth.uid();
  RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.run_email_rules_for_message(_message_id uuid, _user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _msg record; _rule record; _from_email text; _has_att boolean; _applied integer := 0;
BEGIN
  SELECT m.id, m.tenant_id, m.subject, m.from_user_id INTO _msg
  FROM public.email_messages m WHERE m.id = _message_id;
  IF _msg.id IS NULL THEN RETURN 0; END IF;

  SELECT p.email INTO _from_email FROM public.profiles p WHERE p.id = _msg.from_user_id;
  SELECT EXISTS (SELECT 1 FROM public.email_attachments a WHERE a.message_id = _message_id)
    INTO _has_att;

  FOR _rule IN
    SELECT * FROM public.email_rules
    WHERE user_id = _user_id AND tenant_id = _msg.tenant_id AND is_enabled
    ORDER BY sort_order, created_at
  LOOP
    CONTINUE WHEN _rule.cond_from IS NOT NULL
      AND coalesce(_from_email, '') NOT ILIKE '%' || _rule.cond_from || '%';
    CONTINUE WHEN _rule.cond_subject_contains IS NOT NULL
      AND coalesce(_msg.subject, '') NOT ILIKE '%' || _rule.cond_subject_contains || '%';
    CONTINUE WHEN _rule.cond_has_attachment AND NOT _has_att;

    IF _rule.act_label_id IS NOT NULL THEN
      INSERT INTO public.email_message_labels (message_id, label_id, tenant_id, created_by)
      VALUES (_message_id, _rule.act_label_id, _msg.tenant_id, _user_id)
      ON CONFLICT DO NOTHING;
    END IF;

    IF _rule.act_folder IS NOT NULL OR _rule.act_mark_read THEN
      UPDATE public.email_states es
         SET folder = coalesce(_rule.act_folder, es.folder),
             is_read = CASE WHEN _rule.act_mark_read THEN true ELSE es.is_read END
       WHERE es.message_id = _message_id AND es.user_id = _user_id;
    END IF;

    _applied := _applied + 1;
  END LOOP;
  RETURN _applied;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.register_email_attachment(
  _message_id uuid, _object_key text, _file_name text, _mime_type text, _size_bytes bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _tenant uuid; _out uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT m.tenant_id INTO _tenant FROM public.email_messages m
   WHERE m.id = _message_id AND m.from_user_id = auth.uid();
  IF _tenant IS NULL THEN RAISE EXCEPTION 'MESSAGE_NOT_FOUND'; END IF;
  IF coalesce(_size_bytes, 0) > 26214400 THEN RAISE EXCEPTION 'ATTACHMENT_TOO_LARGE'; END IF;

  INSERT INTO public.email_attachments (
    tenant_id, message_id, object_key, file_name, mime_type, size_bytes, created_by, updated_by
  ) VALUES (
    _tenant, _message_id, _object_key, _file_name, _mime_type,
    coalesce(_size_bytes, 0), auth.uid(), auth.uid()
  ) RETURNING id INTO _out;
  RETURN _out;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.search_email_messages(
  _folder text, _starred_only boolean, _keyword text, _from_query text, _to_query text,
  _date_from timestamptz, _date_to timestamptz, _has_attachment boolean,
  _label_ids uuid[], _limit integer, _offset integer
) RETURNS TABLE (
  message_id uuid, thread_id uuid, subject text, body text, from_user_id uuid,
  sender_name text, sender_email text, sent_at timestamptz, created_at timestamptz,
  is_draft boolean, folder text, is_read boolean, is_starred boolean,
  attachment_count integer, label_ids uuid[], total_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  WITH base AS (
    SELECT es.message_id, m.thread_id, m.subject, m.body, m.from_user_id,
           p.display_name AS sender_name, p.email AS sender_email,
           m.sent_at, m.created_at, m.is_draft, es.folder, es.is_read, es.is_starred,
           (SELECT count(*)::int FROM public.email_attachments a WHERE a.message_id = m.id)
             AS attachment_count,
           coalesce((SELECT array_agg(ml.label_id) FROM public.email_message_labels ml
                      WHERE ml.message_id = m.id), '{}'::uuid[]) AS label_ids,
           (SELECT array_agg(pr.email) FROM public.profiles pr
             WHERE pr.id = ANY(coalesce(m.to_user_ids, '{}'::uuid[])
                               || coalesce(m.cc_user_ids, '{}'::uuid[]))) AS recipient_emails
    FROM public.email_states es
    JOIN public.email_messages m ON m.id = es.message_id
    LEFT JOIN public.profiles p ON p.id = m.from_user_id
    WHERE es.user_id = auth.uid()
      AND (_folder IS NULL OR es.folder = _folder)
      AND (NOT coalesce(_starred_only, false) OR es.is_starred)
  ), filtered AS (
    SELECT * FROM base
    WHERE (coalesce(btrim(_keyword), '') = ''
           OR subject ILIKE '%' || btrim(_keyword) || '%'
           OR body ILIKE '%' || btrim(_keyword) || '%')
      AND (coalesce(btrim(_from_query), '') = ''
           OR coalesce(sender_email, '') ILIKE '%' || btrim(_from_query) || '%'
           OR coalesce(sender_name, '') ILIKE '%' || btrim(_from_query) || '%')
      AND (coalesce(btrim(_to_query), '') = ''
           OR EXISTS (SELECT 1 FROM unnest(coalesce(recipient_emails, '{}'::text[])) re
                       WHERE re ILIKE '%' || btrim(_to_query) || '%'))
      AND (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to IS NULL OR created_at <= _date_to)
      AND (NOT coalesce(_has_attachment, false) OR attachment_count > 0)
      AND (coalesce(array_length(_label_ids, 1), 0) = 0 OR label_ids && _label_ids)
  )
  SELECT message_id, thread_id, subject, body, from_user_id, sender_name, sender_email,
         sent_at, created_at, is_draft, folder, is_read, is_starred, attachment_count, label_ids,
         (SELECT count(*) FROM filtered) AS total_count
  FROM filtered
  ORDER BY created_at DESC
  LIMIT greatest(coalesce(_limit, 20), 1)
  OFFSET greatest(coalesce(_offset, 0), 0);
$fn$;

GRANT EXECUTE ON FUNCTION public.upsert_email_label(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email_label(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_email_labels(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_email_rule(uuid, uuid, text, boolean, text, text, boolean, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_email_rules_for_message(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_email_attachment(uuid, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_email_messages(text, boolean, text, text, text, timestamptz, timestamptz, boolean, uuid[], integer, integer) TO authenticated;
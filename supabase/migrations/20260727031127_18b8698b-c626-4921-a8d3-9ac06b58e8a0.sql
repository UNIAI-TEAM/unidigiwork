CREATE OR REPLACE FUNCTION public._test_unconfirm_auth_email(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE _email text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  IF _email IS NULL THEN RETURN false; END IF;
  -- Fixture guard: only sec3_ test accounts may be mutated.
  IF _email NOT LIKE 'sec3\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only test fixture accounts' USING ERRCODE = '42501';
  END IF;
  UPDATE auth.users SET email_confirmed_at = NULL, confirmed_at = NULL WHERE id = _user_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public._test_unconfirm_auth_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._test_unconfirm_auth_email(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_unconfirm_auth_email(uuid) TO service_role;
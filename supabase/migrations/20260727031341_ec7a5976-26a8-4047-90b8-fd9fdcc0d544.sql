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
  IF _email NOT LIKE 'sec3\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only test fixture accounts' USING ERRCODE = '42501';
  END IF;
  UPDATE auth.users SET email_confirmed_at = NULL WHERE id = _user_id;
  RETURN true;
END $$;
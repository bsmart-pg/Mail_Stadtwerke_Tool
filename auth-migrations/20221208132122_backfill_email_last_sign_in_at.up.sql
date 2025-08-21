DO $$
BEGIN
  UPDATE auth.identities
  SET last_sign_in_at = '2022-11-25'
  WHERE last_sign_in_at IS NULL
    AND created_at = '2022-11-25'
    AND updated_at = '2022-11-25'
    AND provider = 'email'
    AND id = user_id;
END $$;

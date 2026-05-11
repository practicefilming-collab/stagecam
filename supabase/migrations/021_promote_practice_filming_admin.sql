DO $$
DECLARE
  matching_profiles integer;
BEGIN
  SELECT count(*)
  INTO matching_profiles
  FROM profiles
  WHERE lower(coalesce(platform_username, '')) = 'practice.filming';

  IF matching_profiles = 1 THEN
    UPDATE profiles
    SET is_admin = true
    WHERE lower(coalesce(platform_username, '')) = 'practice.filming';
  END IF;
END $$;

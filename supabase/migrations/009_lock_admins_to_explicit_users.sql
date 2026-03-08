-- Admin access is explicitly assigned to approved accounts, not by auth provider.
UPDATE profiles
SET is_admin = false
WHERE is_admin IS DISTINCT FROM false;

UPDATE profiles AS p
SET is_admin = true
FROM auth.users AS u
WHERE p.id = u.id
  AND lower(u.email) IN (
    'mr.ridley.enterprises@gmail.com',
    'alistair.ridley@googlemail.com'
  );

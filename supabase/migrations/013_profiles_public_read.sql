-- Allow all authenticated users to read profiles
-- Needed for script_requests, panels, and other joins that display user names
CREATE POLICY "Authenticated users can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

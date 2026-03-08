-- Add admin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Set admin for Google auth users (project creator)
UPDATE profiles SET is_admin = true WHERE auth_provider = 'google';

ALTER TABLE audition_scenes
  ADD COLUMN IF NOT EXISTS processing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE audition_room_sessions
  ADD COLUMN IF NOT EXISTS active_take_id uuid,
  ADD COLUMN IF NOT EXISTS draft_assignments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS audition_takes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  audition_scene_id uuid NOT NULL REFERENCES audition_scenes(id) ON DELETE CASCADE,
  room_session_id uuid REFERENCES audition_room_sessions(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('setup', 'recording', 'completed')) DEFAULT 'setup',
  started_by_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_audition_takes_scene
  ON audition_takes(audition_scene_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audition_takes_room
  ON audition_takes(room_session_id, created_at DESC);

ALTER TABLE audition_room_sessions
  ADD CONSTRAINT audition_room_sessions_active_take_id_fkey
  FOREIGN KEY (active_take_id) REFERENCES audition_takes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS audition_take_role_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  take_id uuid NOT NULL REFERENCES audition_takes(id) ON DELETE CASCADE,
  audition_role_id uuid REFERENCES audition_roles(id) ON DELETE SET NULL,
  role_name text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN ('human', 'fallback_audio')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (take_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_audition_take_role_assignments_take
  ON audition_take_role_assignments(take_id);

CREATE TABLE IF NOT EXISTS audition_take_clips (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  take_id uuid NOT NULL REFERENCES audition_takes(id) ON DELETE CASCADE,
  audition_scene_id uuid NOT NULL REFERENCES audition_scenes(id) ON DELETE CASCADE,
  room_session_id uuid REFERENCES audition_room_sessions(id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  sequence_index integer NOT NULL,
  line_text text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  duration_seconds numeric,
  byte_length bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audition_take_clips_take
  ON audition_take_clips(take_id, sequence_index, created_at);

ALTER TABLE audition_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_take_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_take_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audition takes readable by authenticated users"
  ON audition_takes FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Audition takes managed by authenticated users"
  ON audition_takes FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Audition take role assignments readable by authenticated users"
  ON audition_take_role_assignments FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Audition take role assignments managed by authenticated users"
  ON audition_take_role_assignments FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Audition take clips readable by authenticated users"
  ON audition_take_clips FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Audition take clips managed by authenticated users"
  ON audition_take_clips FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

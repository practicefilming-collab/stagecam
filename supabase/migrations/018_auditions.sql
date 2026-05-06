ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS auditions_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE audition_scripts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  source_label text NOT NULL,
  storage_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  assigned_rehearser_user_id uuid NOT NULL REFERENCES profiles(id),
  uploaded_by_user_id uuid NOT NULL REFERENCES profiles(id),
  processed_by_admin_id uuid REFERENCES profiles(id),
  status text NOT NULL CHECK (status IN ('uploaded', 'processing', 'ready', 'archived')) DEFAULT 'uploaded',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX idx_audition_scripts_assigned_rehearser
  ON audition_scripts(assigned_rehearser_user_id);
CREATE INDEX idx_audition_scripts_status
  ON audition_scripts(status);

CREATE TABLE audition_scenes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  label text NOT NULL,
  order_index integer NOT NULL,
  source_page_ref text,
  scene_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audition_script_id, order_index)
);

CREATE INDEX idx_audition_scenes_script
  ON audition_scenes(audition_script_id);

CREATE TABLE audition_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audition_scene_id uuid NOT NULL REFERENCES audition_scenes(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audition_scene_id, order_index)
);

CREATE INDEX idx_audition_roles_scene
  ON audition_roles(audition_scene_id);

CREATE TABLE audition_target_roles (
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  assigned_rehearser_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  audition_role_id uuid NOT NULL REFERENCES audition_roles(id) ON DELETE CASCADE,
  selected_role_name text NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audition_script_id, assigned_rehearser_user_id)
);

CREATE TABLE audition_scene_progress (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  audition_scene_id uuid NOT NULL REFERENCES audition_scenes(id) ON DELETE CASCADE,
  assigned_rehearser_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  selected_role_name text NOT NULL,
  progression_step text NOT NULL CHECK (progression_step IN ('scene_familiarization', 'line_lock', 'cue_confidence', 'room_ready')),
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audition_script_id, audition_scene_id, assigned_rehearser_user_id, selected_role_name, progression_step)
);

CREATE INDEX idx_audition_scene_progress_script_user
  ON audition_scene_progress(audition_script_id, assigned_rehearser_user_id);

CREATE TABLE audition_room_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  active_scene_id uuid REFERENCES audition_scenes(id) ON DELETE SET NULL,
  host_user_id uuid NOT NULL REFERENCES profiles(id),
  room_code text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('waiting', 'active', 'ended')) DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX idx_audition_room_sessions_script
  ON audition_room_sessions(audition_script_id);
CREATE INDEX idx_audition_room_sessions_code
  ON audition_room_sessions(room_code);

CREATE TABLE audition_room_participants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_session_id uuid NOT NULL REFERENCES audition_room_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_type text NOT NULL CHECK (role_type IN ('host', 'assigned_rehearser', 'guest', 'admin')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (room_session_id, user_id)
);

CREATE INDEX idx_audition_room_participants_room
  ON audition_room_participants(room_session_id);

CREATE TABLE audition_attempts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  audition_scene_id uuid NOT NULL REFERENCES audition_scenes(id) ON DELETE CASCADE,
  audition_role_id uuid REFERENCES audition_roles(id) ON DELETE SET NULL,
  selected_role_name text NOT NULL,
  practice_mode text NOT NULL CHECK (practice_mode IN ('guided_read', 'cue_response', 'room_rehearsal')),
  progression_step text NOT NULL CHECK (progression_step IN ('scene_familiarization', 'line_lock', 'cue_confidence', 'room_ready')),
  ownership_type text NOT NULL CHECK (ownership_type IN ('assigned_rehearser', 'guest_participant')),
  room_session_id uuid REFERENCES audition_room_sessions(id) ON DELETE SET NULL,
  recording_ref text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audition_attempts_script_scene_user
  ON audition_attempts(audition_script_id, audition_scene_id, user_id);
CREATE INDEX idx_audition_attempts_room
  ON audition_attempts(room_session_id);

ALTER TABLE audition_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_target_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_scene_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_room_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE audition_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audition scripts readable by admins or assigned rehearser"
  ON audition_scripts FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_scripts.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition scripts insertable by admins or allowlisted users"
  ON audition_scripts FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by_user_id
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_admin = true
          OR (
            profiles.auditions_enabled = true
            AND assigned_rehearser_user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Audition scripts updatable by admins"
  ON audition_scripts FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Audition scenes readable by script viewers"
  ON audition_scenes FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM audition_scripts
      JOIN profiles ON profiles.id = auth.uid()
      WHERE audition_scripts.id = audition_scenes.audition_script_id
        AND (profiles.is_admin = true OR audition_scripts.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition scenes managed by admins"
  ON audition_scenes FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Audition roles readable by script viewers"
  ON audition_roles FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM audition_scenes
      JOIN audition_scripts ON audition_scripts.id = audition_scenes.audition_script_id
      JOIN profiles ON profiles.id = auth.uid()
      WHERE audition_scenes.id = audition_roles.audition_scene_id
        AND (profiles.is_admin = true OR audition_scripts.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition roles managed by admins"
  ON audition_roles FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Audition target roles readable by admins or assigned rehearser"
  ON audition_target_roles FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_target_roles.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition target roles managed by admins or assigned rehearser"
  ON audition_target_roles FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_target_roles.assigned_rehearser_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_target_roles.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition progress readable by admins or assigned rehearser"
  ON audition_scene_progress FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_scene_progress.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition progress managed by admins or assigned rehearser"
  ON audition_scene_progress FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_scene_progress.assigned_rehearser_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR audition_scene_progress.assigned_rehearser_user_id = auth.uid())
    )
  );

CREATE POLICY "Audition rooms readable by participants or owners"
  ON audition_room_sessions FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM audition_scripts
      JOIN profiles ON profiles.id = auth.uid()
      WHERE audition_scripts.id = audition_room_sessions.audition_script_id
        AND (
          profiles.is_admin = true
          OR audition_scripts.assigned_rehearser_user_id = auth.uid()
          OR audition_room_sessions.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM audition_room_participants
            WHERE audition_room_participants.room_session_id = audition_room_sessions.id
              AND audition_room_participants.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Audition rooms managed by authenticated users"
  ON audition_room_sessions FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Audition room participants readable by room viewers"
  ON audition_room_participants FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Audition room participants managed by authenticated users"
  ON audition_room_participants FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Audition attempts readable by owner or admin"
  ON audition_attempts FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_admin = true
          OR audition_attempts.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM audition_scripts
            WHERE audition_scripts.id = audition_attempts.audition_script_id
              AND audition_scripts.assigned_rehearser_user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Audition attempts insertable by authenticated users"
  ON audition_attempts FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('audition-scripts', 'audition-scripts', false)
ON CONFLICT (id) DO NOTHING;

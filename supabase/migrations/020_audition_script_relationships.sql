CREATE TABLE IF NOT EXISTS audition_script_relationships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audition_script_id uuid NOT NULL REFERENCES audition_scripts(id) ON DELETE CASCADE,
  assigned_rehearser_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  related_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('admin_to_assignee', 'rehearsal_partner_to_assignee')),
  scenario_source text NOT NULL CHECK (scenario_source IN ('assignment_admin_access', 'room_participation')),
  room_session_id uuid REFERENCES audition_room_sessions(id) ON DELETE SET NULL,
  project_codename text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audition_script_relationships_script
  ON audition_script_relationships(audition_script_id);

CREATE INDEX IF NOT EXISTS idx_audition_script_relationships_related_user
  ON audition_script_relationships(related_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audition_script_relationships_unique_admin
  ON audition_script_relationships(audition_script_id, related_user_id, relationship_type, scenario_source)
  WHERE room_session_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_audition_script_relationships_unique_room
  ON audition_script_relationships(audition_script_id, related_user_id, relationship_type, scenario_source, room_session_id)
  WHERE room_session_id IS NOT NULL;

ALTER TABLE audition_script_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audition script relationships readable by viewers" ON audition_script_relationships;
CREATE POLICY "Audition script relationships readable by viewers"
  ON audition_script_relationships FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_admin = true
          OR audition_script_relationships.related_user_id = auth.uid()
          OR audition_script_relationships.assigned_rehearser_user_id = auth.uid()
        )
    )
  );

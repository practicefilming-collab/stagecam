-- AI performer and generation-run foundation
-- Adds additive tables for synthetic performers and line-level generation audit trails.

CREATE TABLE IF NOT EXISTS ai_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  platform text NOT NULL DEFAULT 'Grok' CHECK (platform = 'Grok'),
  voice_persona_id text NOT NULL,
  voice_persona_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_profiles_script_id
  ON ai_profiles(script_id);

CREATE INDEX IF NOT EXISTS idx_ai_profiles_status
  ON ai_profiles(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_profiles_script_display_name
  ON ai_profiles(script_id, display_name);

CREATE OR REPLACE FUNCTION set_ai_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_profiles_updated_at ON ai_profiles;
CREATE TRIGGER trg_ai_profiles_updated_at
  BEFORE UPDATE ON ai_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_ai_profiles_updated_at();

ALTER TABLE ai_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read AI profiles" ON ai_profiles;
CREATE POLICY "Authenticated users can read AI profiles"
  ON ai_profiles FOR SELECT
  USING (auth.role() = 'authenticated');


CREATE TABLE IF NOT EXISTS script_generation_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  ai_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  execution_mode text NOT NULL DEFAULT 'offline_batch' CHECK (execution_mode = 'offline_batch'),
  character_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_lines integer NOT NULL DEFAULT 0 CHECK (total_lines >= 0),
  persisted_lines integer NOT NULL DEFAULT 0 CHECK (persisted_lines >= 0),
  failed_lines integer NOT NULL DEFAULT 0 CHECK (failed_lines >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_generation_runs_script_id
  ON script_generation_runs(script_id);

CREATE INDEX IF NOT EXISTS idx_script_generation_runs_status_created
  ON script_generation_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_generation_runs_ai_profile_ids
  ON script_generation_runs USING gin(ai_profile_ids);

CREATE OR REPLACE FUNCTION set_script_generation_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_script_generation_runs_updated_at ON script_generation_runs;
CREATE TRIGGER trg_script_generation_runs_updated_at
  BEFORE UPDATE ON script_generation_runs
  FOR EACH ROW
  EXECUTE FUNCTION set_script_generation_runs_updated_at();

ALTER TABLE script_generation_runs ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS line_generation_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id uuid NOT NULL REFERENCES script_generation_runs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  ai_profile_id uuid NOT NULL REFERENCES ai_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'interpreted', 'synthesized', 'persisted', 'failed')),
  source_line_snapshot text NOT NULL,
  prompt_context_version text,
  pause_before_ms integer CHECK (pause_before_ms >= 0),
  pause_after_ms integer CHECK (pause_after_ms >= 0),
  emotion_labels text[] NOT NULL DEFAULT '{}'::text[],
  delivery_notes text,
  cadence_notes text,
  continuity_notes text,
  interpretation_provider text NOT NULL DEFAULT 'Grok',
  interpretation_request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  interpretation_response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthesis_provider text,
  synthesis_request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthesis_response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthesis_asset_key text,
  recording_id uuid REFERENCES recordings(id) ON DELETE SET NULL,
  error_message text,
  error_details jsonb,
  interpreted_at timestamptz,
  synthesized_at timestamptz,
  persisted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_generation_records_run_profile_chunk
  ON line_generation_records(run_id, ai_profile_id, chunk_id);

CREATE INDEX IF NOT EXISTS idx_line_generation_records_run_status
  ON line_generation_records(run_id, status);

CREATE INDEX IF NOT EXISTS idx_line_generation_records_profile_status
  ON line_generation_records(ai_profile_id, status);

CREATE INDEX IF NOT EXISTS idx_line_generation_records_chunk_id
  ON line_generation_records(chunk_id);

CREATE INDEX IF NOT EXISTS idx_line_generation_records_recording_id
  ON line_generation_records(recording_id);

CREATE OR REPLACE FUNCTION set_line_generation_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_line_generation_records_updated_at ON line_generation_records;
CREATE TRIGGER trg_line_generation_records_updated_at
  BEFORE UPDATE ON line_generation_records
  FOR EACH ROW
  EXECUTE FUNCTION set_line_generation_records_updated_at();

ALTER TABLE line_generation_records ENABLE ROW LEVEL SECURITY;


ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS ai_profile_id uuid REFERENCES ai_profiles(id) ON DELETE SET NULL;

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS generation_run_id uuid REFERENCES script_generation_runs(id) ON DELETE SET NULL;

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS line_generation_record_id uuid REFERENCES line_generation_records(id) ON DELETE SET NULL;

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS recording_source text NOT NULL DEFAULT 'human' CHECK (recording_source IN ('human', 'ai_generated'));

ALTER TABLE recordings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE recordings
  ALTER COLUMN room_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recordings_ai_profile_id
  ON recordings(ai_profile_id);

CREATE INDEX IF NOT EXISTS idx_recordings_generation_run_id
  ON recordings(generation_run_id);

CREATE INDEX IF NOT EXISTS idx_recordings_line_generation_record_id
  ON recordings(line_generation_record_id);

CREATE INDEX IF NOT EXISTS idx_recordings_recording_source
  ON recordings(recording_source);

-- Async AI scene generation jobs
-- Breaks full-script AI generation into resumable scene/profile units.

CREATE TABLE IF NOT EXISTS scene_generation_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id uuid NOT NULL REFERENCES script_generation_runs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  ai_profile_id uuid NOT NULL REFERENCES ai_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  regenerate_existing boolean NOT NULL DEFAULT false,
  total_lines integer NOT NULL DEFAULT 0 CHECK (total_lines >= 0),
  persisted_lines integer NOT NULL DEFAULT 0 CHECK (persisted_lines >= 0),
  failed_lines integer NOT NULL DEFAULT 0 CHECK (failed_lines >= 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scene_generation_jobs_run_created
  ON scene_generation_jobs(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_generation_jobs_status_created
  ON scene_generation_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_generation_jobs_profile_status
  ON scene_generation_jobs(ai_profile_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_generation_jobs_scene_status
  ON scene_generation_jobs(scene_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_generation_jobs_unique_run_scene_profile
  ON scene_generation_jobs(run_id, scene_id, ai_profile_id);

CREATE OR REPLACE FUNCTION set_scene_generation_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scene_generation_jobs_updated_at ON scene_generation_jobs;
CREATE TRIGGER trg_scene_generation_jobs_updated_at
  BEFORE UPDATE ON scene_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_scene_generation_jobs_updated_at();

ALTER TABLE scene_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Async scene export jobs
CREATE TABLE IF NOT EXISTS scene_export_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'expired')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  error_message text,
  output_r2_key text,
  output_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_scene_export_jobs_requested_by_created
  ON scene_export_jobs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_export_jobs_scene_created
  ON scene_export_jobs(scene_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_export_jobs_status_created
  ON scene_export_jobs(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_export_jobs_one_active_per_user_scene
  ON scene_export_jobs(scene_id, requested_by)
  WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION set_scene_export_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scene_export_jobs_updated_at ON scene_export_jobs;
CREATE TRIGGER trg_scene_export_jobs_updated_at
  BEFORE UPDATE ON scene_export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_scene_export_jobs_updated_at();

ALTER TABLE scene_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own export jobs" ON scene_export_jobs;
CREATE POLICY "Users can read own export jobs"
  ON scene_export_jobs FOR SELECT
  USING (auth.uid() = requested_by);

DROP POLICY IF EXISTS "Users can create own export jobs" ON scene_export_jobs;
CREATE POLICY "Users can create own export jobs"
  ON scene_export_jobs FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

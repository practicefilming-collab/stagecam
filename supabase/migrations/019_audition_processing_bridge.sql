ALTER TABLE audition_scripts
  ADD COLUMN IF NOT EXISTS processing_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS source_audition_script_id uuid REFERENCES audition_scripts(id) ON DELETE SET NULL;

ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS processing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scripts_is_internal
  ON scripts(is_internal);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scripts_source_audition_script_id
  ON scripts(source_audition_script_id)
  WHERE source_audition_script_id IS NOT NULL;

ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS processing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ai_voice_verification_samples (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_profile_id uuid NOT NULL REFERENCES ai_profiles(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
  sample_text text NOT NULL,
  requested_voice_persona_id text NOT NULL,
  resolved_voice_id text NOT NULL,
  expressive_text text,
  storage_key text,
  content_type text,
  byte_length integer,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_voice_verification_samples_profile_created
  ON ai_voice_verification_samples(ai_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_voice_verification_samples_script_created
  ON ai_voice_verification_samples(script_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_ai_voice_verification_samples_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_voice_verification_samples_updated_at ON ai_voice_verification_samples;
CREATE TRIGGER trg_ai_voice_verification_samples_updated_at
  BEFORE UPDATE ON ai_voice_verification_samples
  FOR EACH ROW
  EXECUTE FUNCTION set_ai_voice_verification_samples_updated_at();

ALTER TABLE ai_voice_verification_samples ENABLE ROW LEVEL SECURITY;

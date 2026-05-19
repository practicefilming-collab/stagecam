CREATE TABLE IF NOT EXISTS public.audition_level1_audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audition_script_id uuid NOT NULL REFERENCES public.audition_scripts(id) ON DELETE CASCADE,
  audition_scene_id uuid NOT NULL REFERENCES public.audition_scenes(id) ON DELETE CASCADE,
  sequence_index integer NOT NULL,
  role_name text,
  line_text text NOT NULL,
  voice_persona_id text,
  voice_persona_label text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  storage_key text,
  content_type text,
  byte_length bigint,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audition_scene_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS audition_level1_audio_assets_script_idx
  ON public.audition_level1_audio_assets(audition_script_id, audition_scene_id);

CREATE INDEX IF NOT EXISTS audition_level1_audio_assets_status_idx
  ON public.audition_level1_audio_assets(audition_scene_id, status);

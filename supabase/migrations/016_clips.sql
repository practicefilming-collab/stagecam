-- Clips feature: TikTok short-form video practice mode
-- Sibling feature to Characters, content-first hierarchy

-- clip_creators (must exist before clips references it)
create table clip_creators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  platform_handle text,
  platform text not null default 'tiktok' check (platform in ('tiktok', 'instagram', 'youtube', 'multi_platform')),
  creator_type text not null default 'unknown' check (creator_type in ('influencer', 'comedian', 'singer', 'actor', 'public_figure', 'unknown')),
  description text,
  character_ref_id uuid, -- future cross-link to Characters system
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clip_creators enable row level security;

create policy "Clip creators readable by authenticated users"
  on clip_creators for select using (auth.role() = 'authenticated');

create policy "Clip creators writable by admins"
  on clip_creators for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip creators updatable by admins"
  on clip_creators for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip creators deletable by admins"
  on clip_creators for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clip_sounds
create table clip_sounds (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  origin_creator_id uuid references clip_creators(id) on delete set null,
  sound_type text not null default 'unknown' check (sound_type in ('original_audio', 'song_clip', 'remix', 'voiceover', 'unknown')),
  duration_ms integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clip_sounds enable row level security;

create policy "Clip sounds readable by authenticated users"
  on clip_sounds for select using (auth.role() = 'authenticated');

create policy "Clip sounds writable by admins"
  on clip_sounds for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip sounds updatable by admins"
  on clip_sounds for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip sounds deletable by admins"
  on clip_sounds for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clip_collections
create table clip_collections (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  description text,
  collection_type text not null default 'custom' check (collection_type in ('trend', 'creator_set', 'theme', 'difficulty_ladder', 'custom')),
  ordering_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clip_collections enable row level security;

create policy "Clip collections readable by authenticated users"
  on clip_collections for select using (auth.role() = 'authenticated');

create policy "Clip collections writable by admins"
  on clip_collections for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip collections updatable by admins"
  on clip_collections for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip collections deletable by admins"
  on clip_collections for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clips
create table clips (
  id uuid primary key default gen_random_uuid(),
  display_title text not null,
  source_url text not null,
  source_platform text not null check (source_platform in ('tiktok', 'instagram_reel', 'youtube_short', 'other')),
  creator_id uuid references clip_creators(id) on delete set null,
  sound_id uuid references clip_sounds(id) on delete set null,
  collection_id uuid references clip_collections(id) on delete set null,
  content_type text not null check (content_type in ('spoken_word', 'lip_sync', 'music_performance', 'comedy_timing', 'mixed')),
  content_language text not null default 'en',
  duration_ms integer,
  difficulty_rating integer check (difficulty_rating between 1 and 5),
  energy_level text not null default 'medium' check (energy_level in ('low', 'medium', 'high', 'explosive')),
  beat_profile text not null default 'speech_paced' check (beat_profile in ('speech_paced', 'musical_beat', 'irregular', 'silent_gaps')),
  tags text[] default '{}',
  category_bucket text not null default 'unsorted' check (category_bucket in ('trending', 'classic', 'creator_spotlight', 'challenge', 'unsorted')),
  character_ref_id uuid, -- future cross-link to Characters system
  video_storage_path text,
  video_file_size_bytes bigint,
  video_checksum text,
  audio_wav_path text,
  audio_aac_path text,
  beat_map_path text,
  speech_segments_path text,
  pipeline_status text not null default 'pending' check (pipeline_status in ('pending', 'downloading', 'extracting', 'analyzing', 'ready_for_review', 'active', 'failed')),
  pipeline_error text,
  is_active boolean not null default false,
  added_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clips enable row level security;

create policy "Clips readable by authenticated users"
  on clips for select using (auth.role() = 'authenticated');

create policy "Clips writable by admins"
  on clips for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clips updatable by admins"
  on clips for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clips deletable by admins"
  on clips for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clip_segments
create table clip_segments (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references clips(id) on delete cascade,
  display_label text not null,
  start_ms integer not null,
  end_ms integer not null,
  segment_type text not null default 'full_clip' check (segment_type in ('full_clip', 'intro', 'main_hook', 'punchline', 'verse', 'chorus', 'outro', 'custom')),
  subtitle_data jsonb, -- structured cue array with word-level timing
  subtitle_source_type text check (subtitle_source_type in ('tiktok_caption', 'speech_to_text', 'manual_entry', 'hybrid')),
  subtitle_verified boolean not null default false,
  difficulty_rating integer check (difficulty_rating between 1 and 5),
  ordering_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clip_segments enable row level security;

create policy "Clip segments readable by authenticated users"
  on clip_segments for select using (auth.role() = 'authenticated');

create policy "Clip segments writable by admins"
  on clip_segments for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip segments updatable by admins"
  on clip_segments for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Clip segments deletable by admins"
  on clip_segments for delete using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clip_visualization_configs
create table clip_visualization_configs (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null unique references clips(id) on delete cascade,
  style_preset text not null default 'waveform_pulse' check (style_preset in ('waveform_pulse', 'particle_burst', 'glow_ring', 'silhouette_bounce', 'minimal_text')),
  color_palette jsonb not null default '{"primary": "#FFD700", "secondary": "#1a1a2e", "accent": "#FF6B35"}',
  creator_avatar_path text,
  beat_reactivity_intensity real not null default 0.7 check (beat_reactivity_intensity between 0.0 and 1.0),
  energy_mapping text not null default 'auto_from_audio' check (energy_mapping in ('auto_from_audio', 'manual_override')),
  created_at timestamptz not null default now()
);

alter table clip_visualization_configs enable row level security;

create policy "Viz configs readable by authenticated users"
  on clip_visualization_configs for select using (auth.role() = 'authenticated');

create policy "Viz configs writable by admins"
  on clip_visualization_configs for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Viz configs updatable by admins"
  on clip_visualization_configs for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clip_attempts
create table clip_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  segment_id uuid not null references clip_segments(id) on delete cascade,
  clip_id uuid not null references clips(id) on delete cascade,
  practice_mode text not null check (practice_mode in ('guided_audio_mixed', 'guided_audio_clean', 'response_recall', 'freestyle_variation')),
  speed_level text not null check (speed_level in ('0.60x', '0.75x', '0.90x', '1.00x')),
  playback_treatment text not null default 'pitch_shifted' check (playback_treatment in ('pitch_shifted', 'pitch_preserved')),
  capture_isolation_type text not null default 'mixed' check (capture_isolation_type in ('mixed', 'clean')),
  pairing_status text not null default 'not_needed' check (pairing_status in ('not_needed', 'pending', 'paired', 'failed', 'skipped')),
  headphone_required_met boolean not null default false,
  step_status text not null default 'available' check (step_status in ('locked', 'available', 'completed', 'skipped', 'conditionally_advanced')),
  step_skipped_reason text,
  recording_path text,
  visualization_active boolean not null default true,
  timing_score real,
  rhythm_score real,
  energy_score real,
  completion_confidence_score real,
  overall_score real,
  pass_result boolean,
  grading_version text default 'clips_v1',
  content_type_grading_profile text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'scored', 'failed'))
);

alter table clip_attempts enable row level security;

create policy "Users can read own clip attempts"
  on clip_attempts for select using (auth.uid() = user_id);

create policy "Users can insert own clip attempts"
  on clip_attempts for insert with check (auth.uid() = user_id);

create policy "Users can update own clip attempts"
  on clip_attempts for update using (auth.uid() = user_id);

-- Admins can read all attempts for analytics
create policy "Admins can read all clip attempts"
  on clip_attempts for select using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- clip_progress (fast completion lookups)
create table clip_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  clip_id uuid not null references clips(id) on delete cascade,
  segment_id uuid references clip_segments(id) on delete cascade,
  highest_unlocked_mode text,
  highest_unlocked_speed text,
  is_segment_complete boolean not null default false,
  is_conditionally_advanced boolean not null default false,
  has_skipped_clean boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(user_id, clip_id, segment_id)
);

alter table clip_progress enable row level security;

create policy "Users can read own clip progress"
  on clip_progress for select using (auth.uid() = user_id);

create policy "Users can insert own clip progress"
  on clip_progress for insert with check (auth.uid() = user_id);

create policy "Users can update own clip progress"
  on clip_progress for update using (auth.uid() = user_id);

-- Admins can read all progress for analytics
create policy "Admins can read all clip progress"
  on clip_progress for select using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- Indexes for common queries
create index idx_clips_creator on clips(creator_id) where creator_id is not null;
create index idx_clips_sound on clips(sound_id) where sound_id is not null;
create index idx_clips_collection on clips(collection_id) where collection_id is not null;
create index idx_clips_pipeline_status on clips(pipeline_status);
create index idx_clips_is_active on clips(is_active) where is_active = true;
create index idx_clips_content_type on clips(content_type);
create index idx_clip_segments_clip on clip_segments(clip_id);
create index idx_clip_attempts_user_segment on clip_attempts(user_id, segment_id);
create index idx_clip_attempts_clip on clip_attempts(clip_id);
create index idx_clip_progress_user_clip on clip_progress(user_id, clip_id);

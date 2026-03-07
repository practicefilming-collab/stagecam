-- StageCam Database Schema
-- Initial migration

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  auth_provider text not null check (auth_provider in ('instagram', 'tiktok', 'google')),
  platform_username text, -- @handle, null for google
  display_name text not null, -- "Instagram - @woody" or "Incognito"
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- scripts
create table scripts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  rank integer, -- IMDB rank
  year integer,
  slug text unique not null,
  total_acts integer not null default 0,
  total_scenes integer not null default 0,
  total_chunks integer not null default 0,
  storage_prefix text not null, -- e.g. "077 - Toy Story (1995)"
  created_at timestamptz not null default now()
);

alter table scripts enable row level security;

create policy "Scripts are readable by all authenticated users"
  on scripts for select using (auth.role() = 'authenticated');

-- acts
create table acts (
  id uuid primary key default uuid_generate_v4(),
  script_id uuid not null references scripts(id) on delete cascade,
  act_number integer not null,
  total_scenes integer not null default 0,
  total_chunks integer not null default 0,
  unique (script_id, act_number)
);

alter table acts enable row level security;

create policy "Acts are readable by all authenticated users"
  on acts for select using (auth.role() = 'authenticated');

-- scenes
create table scenes (
  id uuid primary key default uuid_generate_v4(),
  act_id uuid not null references acts(id) on delete cascade,
  scene_number integer not null,
  scene_heading text,
  total_chunks integer not null default 0,
  unique_characters text[] not null default '{}',
  unique (act_id, scene_number)
);

alter table scenes enable row level security;

create policy "Scenes are readable by all authenticated users"
  on scenes for select using (auth.role() = 'authenticated');

-- chunks
create table chunks (
  id uuid primary key default uuid_generate_v4(),
  scene_id uuid not null references scenes(id) on delete cascade,
  chunk_index integer not null, -- global index
  chunk_in_scene integer not null, -- position within scene
  type text not null check (type in ('scene_heading', 'action', 'dialogue', 'transition')),
  character text, -- for dialogue chunks
  tts_text text, -- clean display text
  chunk_text text not null, -- full text with headers
  tts_audio_url text -- Supabase Storage path
);

create index idx_chunks_scene_id on chunks(scene_id);
create index idx_chunks_type on chunks(type);
create index idx_chunks_character on chunks(character);

alter table chunks enable row level security;

create policy "Chunks are readable by all authenticated users"
  on chunks for select using (auth.role() = 'authenticated');

-- rooms
create table rooms (
  id uuid primary key default uuid_generate_v4(),
  creator_id uuid not null references profiles(id),
  script_id uuid not null references scripts(id),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'closed')),
  selection_mode text not null default 'auto' check (selection_mode in ('auto', 'pick')),
  selected_act_id uuid references acts(id),
  selected_scene_id uuid references scenes(id),
  room_code text unique not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);

create index idx_rooms_room_code on rooms(room_code);
create index idx_rooms_status on rooms(status);

alter table rooms enable row level security;

create policy "Rooms are readable by participants"
  on rooms for select using (auth.role() = 'authenticated');

create policy "Rooms can be created by authenticated users"
  on rooms for insert with check (auth.uid() = creator_id);

create policy "Rooms can be updated by creator"
  on rooms for update using (auth.uid() = creator_id);

-- room_participants
create table room_participants (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(id),
  joined_at timestamptz not null default now(),
  assigned_chunks jsonb default '[]', -- array of {chunk_id, role, character?}
  is_creator boolean not null default false,
  unique (room_id, user_id)
);

alter table room_participants enable row level security;

create policy "Participants can read room participants"
  on room_participants for select using (auth.role() = 'authenticated');

create policy "Users can join rooms"
  on room_participants for insert with check (auth.uid() = user_id);

create policy "Participants can be updated"
  on room_participants for update using (auth.role() = 'authenticated');

-- recordings
create table recordings (
  id uuid primary key default uuid_generate_v4(),
  chunk_id uuid not null references chunks(id),
  user_id uuid not null references profiles(id),
  room_id uuid not null references rooms(id),
  video_url text not null,
  duration_seconds numeric,
  format text not null default 'webm',
  created_at timestamptz not null default now()
);

create index idx_recordings_chunk_id on recordings(chunk_id);
create index idx_recordings_user_id on recordings(user_id);
create index idx_recordings_room_id on recordings(room_id);

alter table recordings enable row level security;

create policy "Users can read recordings they participate in"
  on recordings for select using (auth.role() = 'authenticated');

create policy "Users can insert own recordings"
  on recordings for insert with check (auth.uid() = user_id);

-- rehearsals (composite sessions for panel)
create table rehearsals (
  id uuid primary key default uuid_generate_v4(),
  scene_id uuid not null references scenes(id),
  recording_ids uuid[] not null default '{}',
  participant_ids uuid[] not null default '{}',
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_rehearsals_participant_ids on rehearsals using gin(participant_ids);

alter table rehearsals enable row level security;

create policy "Users can read rehearsals they participate in"
  on rehearsals for select using (auth.uid() = any(participant_ids));

-- script_requests
create table script_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id),
  title text not null,
  fulfilled_script_id uuid references scripts(id),
  created_at timestamptz not null default now()
);

alter table script_requests enable row level security;

create policy "Script requests are readable by all authenticated users"
  on script_requests for select using (auth.role() = 'authenticated');

create policy "Users can create script requests"
  on script_requests for insert with check (auth.uid() = user_id);

-- script_request_votes
create table script_request_votes (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references script_requests(id) on delete cascade,
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

alter table script_request_votes enable row level security;

create policy "Votes are readable by all authenticated users"
  on script_request_votes for select using (auth.role() = 'authenticated');

create policy "Users can vote"
  on script_request_votes for insert with check (auth.uid() = user_id);

create policy "Users can remove own votes"
  on script_request_votes for delete using (auth.uid() = user_id);

-- chunk_likes (private tracking)
create table chunk_likes (
  id uuid primary key default uuid_generate_v4(),
  recording_id uuid not null references recordings(id) on delete cascade,
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (recording_id, user_id)
);

alter table chunk_likes enable row level security;

create policy "Users can read own likes"
  on chunk_likes for select using (auth.uid() = user_id);

create policy "Users can insert likes"
  on chunk_likes for insert with check (auth.uid() = user_id);

create policy "Users can remove own likes"
  on chunk_likes for delete using (auth.uid() = user_id);

-- Storage bucket policies (applied via Supabase dashboard or API)
-- tts-audio: public read
-- recordings: authenticated read, authenticated insert (own path)

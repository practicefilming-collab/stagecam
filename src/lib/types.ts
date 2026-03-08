/** Shared TypeScript interfaces matching the Supabase schema. */
export type AuthProvider = 'instagram' | 'tiktok' | 'google';

export type ChunkType = 'scene_heading' | 'action' | 'dialogue' | 'transition';

export type RoomStatus = 'waiting' | 'active' | 'closed';

export type SelectionMode = 'auto' | 'pick';

export interface Profile {
  id: string;
  auth_provider: AuthProvider;
  platform_username: string | null;
  display_name: string;
  terms_accepted_at: string | null;
  terms_version: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Script {
  id: string;
  title: string;
  rank: number | null;
  year: number | null;
  slug: string;
  total_acts: number;
  total_scenes: number;
  total_chunks: number;
  storage_prefix: string;
  created_at: string;
}

export interface Act {
  id: string;
  script_id: string;
  act_number: number;
  total_scenes: number;
  total_chunks: number;
}

export interface Scene {
  id: string;
  act_id: string;
  scene_number: number;
  scene_heading: string | null;
  total_chunks: number;
  unique_characters: string[];
  character_stats?: { name: string; dialogue_chunks: number; total_chunks: number }[];
  performable_chunks: number;
}

export interface Chunk {
  id: string;
  scene_id: string;
  chunk_index: number;
  chunk_in_scene: number;
  type: ChunkType;
  character: string | null;
  tts_text: string | null;
  chunk_text: string;
  tts_audio_url: string | null;
  is_system: boolean;
}

export interface Room {
  id: string;
  creator_id: string;
  script_id: string | null;
  status: RoomStatus;
  selection_mode: SelectionMode;
  selected_act_id: string | null;
  selected_scene_id: string | null;
  room_code: string;
  created_at: string;
  started_at: string | null;
  closed_at: string | null;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  assigned_chunks: AssignedChunk[];
  is_creator: boolean;
}

export interface AssignedChunk {
  chunk_id: string;
  role: 'dialogue' | 'action' | 'scene_heading' | 'transition';
  character?: string;
}

export interface Recording {
  id: string;
  chunk_id: string;
  user_id: string;
  room_id: string;
  video_url: string;
  duration_seconds: number | null;
  format: string;
  created_at: string;
}

export interface Rehearsal {
  id: string;
  scene_id: string;
  recording_ids: string[];
  participant_ids: string[];
  is_complete: boolean;
  created_at: string;
}

export interface ScriptRequest {
  id: string;
  user_id: string;
  title: string;
  fulfilled_script_id: string | null;
  created_at: string;
}

export interface ScriptRequestVote {
  id: string;
  request_id: string;
  user_id: string;
  created_at: string;
}

export interface ChunkLike {
  id: string;
  recording_id: string;
  user_id: string;
  created_at: string;
}

// Presence type for realtime
export interface RoomPresence {
  userId: string;
  displayName: string;
  joinedAt: string;
}

// Parsed chunk from pipeline markdown
export interface ParsedChunk {
  script: string;
  rank: number;
  year: number;
  act: number;
  scene: number;
  scene_heading: string;
  chunk_index: number;
  chunk_in_scene: number;
  type: ChunkType;
  character?: string;
  content: string;
}

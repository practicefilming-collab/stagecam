/** Shared TypeScript interfaces matching the Supabase schema. */
export type AuthProvider = 'instagram' | 'tiktok' | 'google';
export type PublicIdentityPlatform = 'instagram' | 'tiktok' | 'incognito';
export type AIProfilePlatform = 'Grok';
export type AIProfileStatus = 'active' | 'paused' | 'archived';
export type ScriptGenerationRunStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type SceneGenerationJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type ScriptGenerationExecutionMode = 'offline_batch';
export type LineGenerationStatus = 'pending' | 'interpreted' | 'synthesized' | 'persisted' | 'failed';
export type RecordingSource = 'human' | 'ai_generated';

export type LineType = 'scene_heading' | 'action' | 'dialogue' | 'transition';
export type ChunkType = LineType;

export type RoomStatus = 'waiting' | 'active' | 'closed';

export type SelectionMode = 'auto' | 'pick';

export interface Profile {
  id: string;
  auth_provider: AuthProvider;
  platform_username: string | null;
  display_name: string;
  public_identity_platform: PublicIdentityPlatform | null;
  public_identity_username: string | null;
  public_identity_source_url: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface AIProfile {
  id: string;
  script_id: string;
  display_name: string;
  status: AIProfileStatus;
  platform: AIProfilePlatform;
  voice_persona_id: string;
  voice_persona_label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScriptGenerationRun {
  id: string;
  script_id: string;
  ai_profile_ids: string[];
  status: ScriptGenerationRunStatus;
  execution_mode: ScriptGenerationExecutionMode;
  character_map: Record<string, unknown>;
  provider_config: Record<string, unknown>;
  retry_policy: Record<string, unknown>;
  total_lines: number;
  persisted_lines: number;
  failed_lines: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SceneGenerationJob {
  id: string;
  run_id: string;
  script_id: string;
  scene_id: string;
  ai_profile_id: string;
  status: SceneGenerationJobStatus;
  progress_pct: number;
  regenerate_existing: boolean;
  total_lines: number;
  persisted_lines: number;
  failed_lines: number;
  attempt_count: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineGenerationRecord {
  id: string;
  run_id: string;
  script_id: string;
  scene_id: string;
  chunk_id: string;
  ai_profile_id: string;
  status: LineGenerationStatus;
  source_line_snapshot: string;
  prompt_context_version: string | null;
  pause_before_ms: number | null;
  pause_after_ms: number | null;
  emotion_labels: string[];
  delivery_notes: string | null;
  cadence_notes: string | null;
  continuity_notes: string | null;
  interpretation_provider: string;
  interpretation_request_payload: Record<string, unknown>;
  interpretation_response_payload: Record<string, unknown>;
  synthesis_provider: string | null;
  synthesis_request_payload: Record<string, unknown>;
  synthesis_response_payload: Record<string, unknown>;
  synthesis_asset_key: string | null;
  recording_id: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  interpreted_at: string | null;
  synthesized_at: string | null;
  persisted_at: string | null;
  created_at: string;
  updated_at: string;
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
  rehearsable_chunks: number;
  roll_calls?: RollCallEntry[];
}

export interface Line {
  id: string;
  scene_id: string;
  chunk_index: number;
  chunk_in_scene: number;
  type: LineType;
  character: string | null;
  tts_text: string | null;
  chunk_text: string;
  tts_audio_url: string | null;
  is_system: boolean;
}

export type Chunk = Line;

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

export interface AssignedLine {
  line_id: string;
  role: LineType;
  character?: string;
}

export interface AssignedChunk {
  chunk_id?: string;  // old sessions
  line_id?: string;   // new sessions (post-7f834a2)
  role: LineType;
  character?: string;
}

export interface Recording {
  id: string;
  chunk_id: string;
  user_id: string | null;
  room_id: string | null;
  ai_profile_id: string | null;
  generation_run_id: string | null;
  line_generation_record_id: string | null;
  recording_source: RecordingSource;
  video_url: string;
  duration_seconds: number | null;
  format: string | null;
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

export interface LineLike {
  id: string;
  recording_id: string;
  user_id: string;
  created_at: string;
}

export type ChunkLike = LineLike;

// Presence type for realtime
export interface RoomPresence {
  userId: string;
  displayName: string;
  publicIdentityPlatform: PublicIdentityPlatform | null;
  publicIdentityUsername: string | null;
  joinedAt: string;
}

export interface RollCallEntry {
  participants: number;
  characters: number;
  narrators: number;
  actionsPerNarrator: number;
}

// Parsed line from pipeline markdown. Source metadata remains chunk-shaped for pipeline compatibility.
export interface ParsedLine {
  script: string;
  rank: number;
  year: number;
  act: number;
  scene: number;
  scene_heading: string;
  chunk_index: number;
  chunk_in_scene: number;
  type: LineType;
  character?: string;
  content: string;
}

export type ParsedChunk = ParsedLine;

/** Shared TypeScript interfaces matching the Supabase schema. */
export type AuthProvider = 'instagram' | 'tiktok' | 'google';
export type PublicIdentityPlatform = 'instagram' | 'tiktok' | 'incognito';
export type AIProfilePlatform = 'Grok';
export type AIProfileStatus = 'active' | 'paused' | 'archived';
export type AIVoiceVerificationStatus = 'ready' | 'failed';
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
  auditions_enabled: boolean;
  created_at: string;
}

export type AuditionStatus = 'uploaded' | 'processing' | 'ready' | 'archived';
export type AuditionPracticeMode = 'guided_read' | 'cue_response' | 'room_rehearsal';
export type AuditionProgressionStep =
  | 'scene_familiarization'
  | 'line_lock'
  | 'cue_confidence'
  | 'room_ready';
export type AuditionAttemptOwnershipType = 'assigned_rehearser' | 'guest_participant';
export type AuditionRoomStatus = 'waiting' | 'active' | 'ended';
export type AuditionRoomParticipantRole = 'host' | 'assigned_rehearser' | 'guest' | 'admin';
export type AuditionRoomParticipantRecordingState = 'idle' | 'recording' | 'awaiting_uploads' | 'complete';
export type AuditionScriptRelationshipType = 'admin_to_assignee' | 'rehearsal_partner_to_assignee';
export type AuditionScriptRelationshipScenarioSource = 'assignment_admin_access' | 'room_participation';
export type AuditionTakeStatus = 'setup' | 'recording' | 'completed';
export type AuditionTakeAssignmentType = 'human' | 'fallback_audio';
export type AuditionReadinessLevel = 'not_started' | 'level_1_ready' | 'level_2_ready' | 'level_3_ready';
export type AuditionLevel1AudioStatus = 'pending' | 'ready' | 'failed';

export interface AuditionScript {
  id: string;
  title: string;
  source_label: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  assigned_rehearser_user_id: string;
  uploaded_by_user_id: string;
  processed_by_admin_id: string | null;
  status: AuditionStatus;
  created_at: string;
  processed_at: string | null;
  archived_at: string | null;
  processing_notes: Record<string, unknown>;
}

export interface AuditionScene {
  id: string;
  audition_script_id: string;
  label: string;
  order_index: number;
  source_page_ref: string | null;
  scene_text: string;
  is_active: boolean;
  processing_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuditionRole {
  id: string;
  audition_scene_id: string;
  name: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditionTargetRole {
  audition_script_id: string;
  assigned_rehearser_user_id: string;
  audition_role_id: string;
  selected_role_name: string;
  selected_at: string;
}

export interface AuditionSceneProgress {
  id: string;
  audition_script_id: string;
  audition_scene_id: string;
  assigned_rehearser_user_id: string;
  selected_role_name: string;
  progression_step: AuditionProgressionStep;
  is_complete: boolean;
  completed_at: string | null;
  updated_at: string;
}

export interface AuditionAttempt {
  id: string;
  user_id: string;
  audition_script_id: string;
  audition_scene_id: string;
  audition_role_id: string | null;
  selected_role_name: string;
  practice_mode: AuditionPracticeMode;
  progression_step: AuditionProgressionStep;
  ownership_type: AuditionAttemptOwnershipType;
  room_session_id: string | null;
  recording_ref: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AuditionRoomSession {
  id: string;
  audition_script_id: string;
  active_scene_id: string | null;
  active_take_id: string | null;
  host_user_id: string;
  room_code: string;
  status: AuditionRoomStatus;
  draft_assignments?: Record<string, unknown>[] | null;
  created_at: string;
  ended_at: string | null;
}

export interface AuditionRoomParticipant {
  id: string;
  room_session_id: string;
  user_id: string;
  role_type: AuditionRoomParticipantRole;
  recording_state: AuditionRoomParticipantRecordingState | null;
  recording_state_take_id: string | null;
  recording_state_updated_at: string | null;
  joined_at: string;
  left_at: string | null;
}

export interface AuditionRoomVoicePresence {
  userId: string;
  displayName: string | null;
  isConnected: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  lastSeenAt: string | null;
}

export interface AuditionScriptRelationship {
  id: string;
  audition_script_id: string;
  assigned_rehearser_user_id: string;
  related_user_id: string;
  relationship_type: AuditionScriptRelationshipType;
  scenario_source: AuditionScriptRelationshipScenarioSource;
  room_session_id: string | null;
  project_codename: string | null;
  created_at: string;
}

export interface AuditionTake {
  id: string;
  audition_script_id: string;
  audition_scene_id: string;
  room_session_id: string | null;
  status: AuditionTakeStatus;
  started_by_user_id: string;
  title: string | null;
  notes: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AuditionTakeRoleAssignment {
  id: string;
  take_id: string;
  audition_role_id: string | null;
  role_name: string;
  user_id: string | null;
  assignment_type: AuditionTakeAssignmentType;
  created_at: string;
}

export interface AuditionTakeClip {
  id: string;
  take_id: string;
  audition_scene_id: string;
  room_session_id: string | null;
  actor_user_id: string;
  role_name: string;
  sequence_index: number;
  line_text: string;
  storage_key: string;
  content_type: string;
  duration_seconds: number | null;
  byte_length: number | null;
  created_at: string;
}

export interface AuditionLevel1AudioAsset {
  id: string;
  audition_script_id: string;
  audition_scene_id: string;
  sequence_index: number;
  role_name: string | null;
  line_text: string;
  voice_persona_id: string | null;
  voice_persona_label: string | null;
  status: AuditionLevel1AudioStatus;
  storage_key: string | null;
  content_type: string | null;
  byte_length: number | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
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

export interface AIVoiceVerificationSample {
  id: string;
  ai_profile_id: string;
  script_id: string;
  status: AIVoiceVerificationStatus;
  sample_text: string;
  requested_voice_persona_id: string;
  resolved_voice_id: string;
  expressive_text: string | null;
  storage_key: string | null;
  content_type: string | null;
  byte_length: number | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
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
  is_internal: boolean;
  source_audition_script_id: string | null;
  processing_metadata: Record<string, unknown>;
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
  processing_metadata?: Record<string, unknown>;
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

// ── Clips ──────────────────────────────────────────────────────────

export type ClipSourcePlatform = 'tiktok' | 'instagram_reel' | 'youtube_short' | 'other';
export type ClipContentType = 'spoken_word' | 'lip_sync' | 'music_performance' | 'comedy_timing' | 'mixed';
export type ClipEnergyLevel = 'low' | 'medium' | 'high' | 'explosive';
export type ClipBeatProfile = 'speech_paced' | 'musical_beat' | 'irregular' | 'silent_gaps';
export type ClipCategoryBucket = 'trending' | 'classic' | 'creator_spotlight' | 'challenge' | 'unsorted';
export type ClipPipelineStatus = 'pending' | 'downloading' | 'extracting' | 'analyzing' | 'ready_for_review' | 'active' | 'failed';
export type ClipPracticeMode = 'guided_audio_mixed' | 'guided_audio_clean' | 'response_recall' | 'freestyle_variation';
export type ClipSpeedLevel = '0.60x' | '0.75x' | '0.90x' | '1.00x';
export type ClipPlaybackTreatment = 'pitch_shifted' | 'pitch_preserved';
export type ClipCaptureIsolation = 'mixed' | 'clean';
export type ClipPairingStatus = 'not_needed' | 'pending' | 'paired' | 'failed' | 'skipped';
export type ClipStepStatus = 'locked' | 'available' | 'completed' | 'skipped' | 'conditionally_advanced';
export type ClipSegmentType = 'full_clip' | 'intro' | 'main_hook' | 'punchline' | 'verse' | 'chorus' | 'outro' | 'custom';
export type ClipSoundType = 'original_audio' | 'song_clip' | 'remix' | 'voiceover' | 'unknown';
export type ClipCreatorType = 'influencer' | 'comedian' | 'singer' | 'actor' | 'public_figure' | 'unknown';
export type ClipCreatorPlatform = 'tiktok' | 'instagram' | 'youtube' | 'multi_platform';
export type ClipCollectionType = 'trend' | 'creator_set' | 'theme' | 'difficulty_ladder' | 'custom';
export type ClipVizPreset = 'waveform_pulse' | 'particle_burst' | 'glow_ring' | 'silhouette_bounce' | 'minimal_text';
export type ClipEnergyMapping = 'auto_from_audio' | 'manual_override';
export type ClipSubtitleSourceType = 'tiktok_caption' | 'speech_to_text' | 'manual_entry' | 'hybrid';
export type ClipAttemptProcessingStatus = 'pending' | 'processing' | 'scored' | 'failed';

export interface Clip {
  id: string;
  display_title: string;
  source_url: string;
  source_platform: ClipSourcePlatform;
  creator_id: string | null;
  sound_id: string | null;
  collection_id: string | null;
  content_type: ClipContentType;
  content_language: string;
  duration_ms: number | null;
  difficulty_rating: number | null;
  energy_level: ClipEnergyLevel;
  beat_profile: ClipBeatProfile;
  tags: string[];
  category_bucket: ClipCategoryBucket;
  character_ref_id: string | null;
  video_storage_path: string | null;
  video_file_size_bytes: number | null;
  video_checksum: string | null;
  audio_wav_path: string | null;
  audio_aac_path: string | null;
  beat_map_path: string | null;
  speech_segments_path: string | null;
  pipeline_status: ClipPipelineStatus;
  pipeline_error: string | null;
  is_active: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface ClipSegment {
  id: string;
  clip_id: string;
  display_label: string;
  start_ms: number;
  end_ms: number;
  segment_type: ClipSegmentType;
  subtitle_data: ClipSubtitleData | null;
  subtitle_source_type: ClipSubtitleSourceType | null;
  subtitle_verified: boolean;
  difficulty_rating: number | null;
  ordering_index: number;
  is_active: boolean;
  created_at: string;
}

export interface ClipSubtitleData {
  cues: ClipSubtitleCue[];
}

export interface ClipSubtitleCue {
  cue_id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  words: ClipSubtitleWord[];
}

export interface ClipSubtitleWord {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
}

export interface ClipSound {
  id: string;
  display_name: string;
  origin_creator_id: string | null;
  sound_type: ClipSoundType;
  duration_ms: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ClipCreator {
  id: string;
  display_name: string;
  platform_handle: string | null;
  platform: ClipCreatorPlatform;
  creator_type: ClipCreatorType;
  description: string | null;
  character_ref_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ClipCollection {
  id: string;
  display_name: string;
  description: string | null;
  collection_type: ClipCollectionType;
  ordering_index: number;
  is_active: boolean;
  created_at: string;
}

export interface ClipVisualizationConfig {
  id: string;
  clip_id: string;
  style_preset: ClipVizPreset;
  color_palette: { primary: string; secondary: string; accent: string };
  creator_avatar_path: string | null;
  beat_reactivity_intensity: number;
  energy_mapping: ClipEnergyMapping;
  created_at: string;
}

export interface ClipAttempt {
  id: string;
  user_id: string;
  segment_id: string;
  clip_id: string;
  practice_mode: ClipPracticeMode;
  speed_level: ClipSpeedLevel;
  playback_treatment: ClipPlaybackTreatment;
  capture_isolation_type: ClipCaptureIsolation;
  pairing_status: ClipPairingStatus;
  headphone_required_met: boolean;
  step_status: ClipStepStatus;
  step_skipped_reason: string | null;
  recording_path: string | null;
  visualization_active: boolean;
  timing_score: number | null;
  rhythm_score: number | null;
  energy_score: number | null;
  completion_confidence_score: number | null;
  overall_score: number | null;
  pass_result: boolean | null;
  grading_version: string;
  content_type_grading_profile: string | null;
  started_at: string;
  completed_at: string | null;
  processing_status: ClipAttemptProcessingStatus;
}

export interface ClipProgress {
  id: string;
  user_id: string;
  clip_id: string;
  segment_id: string | null;
  highest_unlocked_mode: ClipPracticeMode | null;
  highest_unlocked_speed: ClipSpeedLevel | null;
  is_segment_complete: boolean;
  is_conditionally_advanced: boolean;
  has_skipped_clean: boolean;
  updated_at: string;
}

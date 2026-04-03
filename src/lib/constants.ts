/** Theme colours */
export const GOLD = '#d4af37';
export const DARK_BG = '#0a0a0a';
export const DARK_SURFACE = '#141414';
export const DARK_BORDER = '#2a2a2a';

/** Current terms-of-service version users must accept */
export const TERMS_VERSION = '1.0';

/** Maximum recording length per line */
export const MAX_RECORDING_DURATION_MS = 120_000; // 2 minutes
/** Maximum users allowed in a single room */
export const MAX_PARTICIPANTS = 30;
/** Soft cap on non-dialogue (action/filler) lines assigned per person in a session. Does not limit dialogue. */
export const MAX_LINES_PER_PERSON = 12;
export const MAX_CHUNKS_PER_PERSON = MAX_LINES_PER_PERSON;
/** Length of the random alphanumeric room invite code */
export const ROOM_CODE_LENGTH = 6;

/** MediaRecorder settings for user video recordings */
export const VIDEO_CONSTRAINTS = {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 2_500_000,
};

/** Supabase Storage bucket names */
export const STORAGE_BUCKETS = {
  TTS_AUDIO: 'tts-audio',
  RECORDINGS: 'recordings',
  CLIP_VIDEOS: 'clip-videos',
  CLIP_AUDIO: 'clip-audio',
  CLIP_ASSETS: 'clip-assets',
} as const;

// ── Clips ──────────────────────────────────────────────────────────

/** Speed tiers for clip practice, in progression order */
export const CLIP_SPEED_TIERS = ['0.60x', '0.75x', '0.90x', '1.00x'] as const;

/** Numeric speed values keyed by tier label */
export const CLIP_SPEED_VALUES: Record<string, number> = {
  '0.60x': 0.60,
  '0.75x': 0.75,
  '0.90x': 0.90,
  '1.00x': 1.00,
};

/** Practice modes in unlock order */
export const CLIP_PRACTICE_MODE_ORDER = [
  'guided_audio_mixed',
  'guided_audio_clean',
  'response_recall',
  'freestyle_variation',
] as const;

/** Maximum clip duration allowed for ingestion (3 minutes) */
export const CLIP_MAX_DURATION_MS = 180_000;

/** Content-type scoring profiles: dimension weights per content type */
export const CLIP_SCORING_PROFILES: Record<string, { timing: number; rhythm: number; energy: number; completion_confidence: number }> = {
  spoken_word:        { timing: 0.30, rhythm: 0.20, energy: 0.35, completion_confidence: 0.15 },
  lip_sync:           { timing: 0.35, rhythm: 0.30, energy: 0.20, completion_confidence: 0.15 },
  music_performance:  { timing: 0.25, rhythm: 0.35, energy: 0.25, completion_confidence: 0.15 },
  comedy_timing:      { timing: 0.35, rhythm: 0.15, energy: 0.35, completion_confidence: 0.15 },
  mixed:              { timing: 0.30, rhythm: 0.25, energy: 0.30, completion_confidence: 0.15 },
};

/** Pass thresholds by speed tier */
export const CLIP_PASS_THRESHOLDS: Record<string, { overall_min: number; dimension_floor: number }> = {
  '0.60x': { overall_min: 72, dimension_floor: 55 },
  '0.75x': { overall_min: 72, dimension_floor: 55 },
  '0.90x': { overall_min: 78, dimension_floor: 55 },
  '1.00x': { overall_min: 83, dimension_floor: 55 },
};

/** Additional minimum dimension scores for response_recall mode */
export const CLIP_RECALL_MINIMUMS = { rhythm: 65, energy: 70 };

/** Freestyle pass threshold (relaxed) */
export const CLIP_FREESTYLE_THRESHOLD = { overall_min: 60 };

/** Default pitch treatment per content type */
export const CLIP_DEFAULT_PITCH_TREATMENT: Record<string, 'pitch_shifted' | 'pitch_preserved'> = {
  spoken_word: 'pitch_shifted',
  lip_sync: 'pitch_preserved',
  music_performance: 'pitch_preserved',
  comedy_timing: 'pitch_shifted',
  mixed: 'pitch_shifted',
};

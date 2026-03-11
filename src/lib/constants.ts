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
} as const;

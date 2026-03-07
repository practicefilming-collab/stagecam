export const GOLD = '#d4af37';
export const DARK_BG = '#0a0a0a';
export const DARK_SURFACE = '#141414';
export const DARK_BORDER = '#2a2a2a';

export const TERMS_VERSION = '1.0';

export const MAX_RECORDING_DURATION_MS = 120_000; // 2 minutes
export const MAX_PARTICIPANTS = 30;
export const ROOM_CODE_LENGTH = 6;

export const VIDEO_CONSTRAINTS = {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 2_500_000,
};

export const STORAGE_BUCKETS = {
  TTS_AUDIO: 'tts-audio',
  RECORDINGS: 'recordings',
} as const;

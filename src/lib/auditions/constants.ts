export const AUDITION_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const AUDITION_ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;

export const AUDITION_STATUSES = ['uploaded', 'processing', 'ready', 'archived'] as const;
export const AUDITION_PROGRESS_STEPS = [
  'scene_familiarization',
  'line_lock',
  'cue_confidence',
  'room_ready',
] as const;
export const AUDITION_PRACTICE_MODES = [
  'guided_read',
  'cue_response',
  'room_rehearsal',
] as const;
export const AUDITION_ATTEMPT_OWNERSHIP_TYPES = [
  'assigned_rehearser',
  'guest_participant',
] as const;

export const AUDITION_STORAGE_BUCKET = 'audition-scripts';

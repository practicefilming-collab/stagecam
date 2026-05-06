import {
  AUDITION_ALLOWED_EXTENSIONS,
  AUDITION_ALLOWED_MIME_TYPES,
} from '@/lib/auditions/constants';

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.at(-1) ?? '' : '';
}

export function isAllowedAuditionFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  const mimeAllowed = AUDITION_ALLOWED_MIME_TYPES.includes(file.type as (typeof AUDITION_ALLOWED_MIME_TYPES)[number]);
  const extAllowed = AUDITION_ALLOWED_EXTENSIONS.includes(ext as (typeof AUDITION_ALLOWED_EXTENSIONS)[number]);
  return mimeAllowed || extAllowed;
}

export function sanitizeStorageFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

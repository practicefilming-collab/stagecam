import type { AuditionStatus } from '@/lib/types';

export function getAuditionStatusLabel(status: AuditionStatus) {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'processing':
      return 'In Admin Prep';
    case 'ready':
      return 'Ready';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

export function getAuditionStatusDescription(status: AuditionStatus) {
  switch (status) {
    case 'uploaded':
      return 'File received. An admin still needs to prepare scenes and roles.';
    case 'processing':
      return 'The script is actively being broken into scenes and mapped for rehearsal.';
    case 'ready':
      return 'Scenes and roles are prepared. The assigned rehearser can work and host rooms.';
    case 'archived':
      return 'This audition is no longer active.';
    default:
      return '';
  }
}

import { ROOM_CODE_LENGTH } from './constants';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/1/O/0 confusion
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function normalizeScriptText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n\n+/g, '\u0000') // preserve paragraph breaks
    .replace(/\n/g, ' ')         // join mid-sentence line breaks
    .replace(/\u0000/g, '\n\n')  // restore paragraph breaks
    .replace(/ {2,}/g, ' ')      // clean double spaces
    .trim();
}

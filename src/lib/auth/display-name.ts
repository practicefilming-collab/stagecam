import type { AuthProvider } from '../types';

export function formatDisplayName(
  provider: AuthProvider,
  platformUsername: string | null
): string {
  switch (provider) {
    case 'instagram':
      return `Instagram - @${platformUsername}`;
    case 'tiktok':
      return `TikTok - @${platformUsername}`;
    case 'google':
      return 'Incognito';
  }
}

export function getProviderColor(provider: AuthProvider): string {
  switch (provider) {
    case 'instagram':
      return 'var(--instagram)';
    case 'tiktok':
      return 'var(--tiktok-teal)';
    case 'google':
      return 'var(--muted)';
  }
}

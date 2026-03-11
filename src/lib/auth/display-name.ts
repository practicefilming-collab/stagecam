import type { PublicIdentityPlatform } from '../types';
export { formatDisplayName, getPublicIdentityLabel as getProviderLabel } from './identity';

export function getProviderColor(provider: PublicIdentityPlatform): string {
  switch (provider) {
    case 'instagram':
      return 'var(--instagram)';
    case 'tiktok':
      return 'var(--tiktok-teal)';
    case 'incognito':
      return 'var(--muted)';
  }
}

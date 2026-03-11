import type {
  AuthProvider,
  Profile,
  PublicIdentityPlatform,
} from '@/lib/types';

const AUTH_PROVIDER_LABELS: Record<AuthProvider, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  google: 'Google',
};

const PUBLIC_PLATFORM_LABELS: Record<PublicIdentityPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  incognito: 'Incognito',
};

type PublicIdentitySummary = Pick<
  Profile,
  'public_identity_platform' | 'public_identity_username' | 'public_identity_source_url'
>;

export function normalizeAuthProvider(rawProvider: string | null | undefined): AuthProvider | null {
  const normalized = rawProvider?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'google') return 'google';
  if (normalized.includes('instagram')) return 'instagram';
  if (normalized.includes('tiktok') || normalized.includes('tik_tok')) return 'tiktok';

  return null;
}

export function normalizePlatformUsername(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, '');
  return normalized ? normalized : null;
}

export function extractPlatformUsername(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;

  const candidates = [
    metadata.preferred_username,
    metadata.user_name,
    metadata.username,
    metadata.screen_name,
    metadata.handle,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = normalizePlatformUsername(candidate);
      if (normalized) return normalized;
    }
  }

  return null;
}

export function formatPlatformUsername(platformUsername: string | null): string | null {
  const normalized = normalizePlatformUsername(platformUsername);
  return normalized ? `@${normalized}` : null;
}

export function getAuthProviderLabel(provider: AuthProvider): string {
  return AUTH_PROVIDER_LABELS[provider];
}

export function getPublicIdentityLabel(platform: PublicIdentityPlatform): string {
  return PUBLIC_PLATFORM_LABELS[platform];
}

export function isPublicIdentityComplete(profile: PublicIdentitySummary): boolean {
  if (!profile.public_identity_platform) return false;
  if (profile.public_identity_platform === 'incognito') return true;
  return !!normalizePlatformUsername(profile.public_identity_username);
}

export function getLegacyMappedIdentity(
  profile: Pick<Profile, 'auth_provider' | 'platform_username'>
): {
  platform: PublicIdentityPlatform;
  username: string | null;
  sourceUrl: string | null;
} | null {
  if (
    (profile.auth_provider === 'instagram' || profile.auth_provider === 'tiktok') &&
    normalizePlatformUsername(profile.platform_username)
  ) {
    return {
      platform: profile.auth_provider,
      username: normalizePlatformUsername(profile.platform_username),
      sourceUrl: null,
    };
  }

  return null;
}

export function getPublicIdentity(
  profile: PublicIdentitySummary
): {
  platform: PublicIdentityPlatform;
  username: string | null;
  sourceUrl: string | null;
} {
  return {
    platform: profile.public_identity_platform ?? 'incognito',
    username: normalizePlatformUsername(profile.public_identity_username),
    sourceUrl: profile.public_identity_source_url,
  };
}

export function formatDisplayName(
  platform: PublicIdentityPlatform,
  platformUsername: string | null
): string {
  if (platform === 'incognito') {
    return 'Incognito';
  }

  return formatPlatformUsername(platformUsername) ?? PUBLIC_PLATFORM_LABELS[platform];
}

export function getProfileDisplayName(
  profile: Pick<
    Profile,
    | 'display_name'
    | 'public_identity_platform'
    | 'public_identity_username'
    | 'public_identity_source_url'
    | 'auth_provider'
    | 'platform_username'
  >
): string {
  if (isPublicIdentityComplete(profile)) {
    const currentIdentity = getPublicIdentity(profile);
    return formatDisplayName(currentIdentity.platform, currentIdentity.username);
  }

  const legacyIdentity = getLegacyMappedIdentity(profile);
  if (legacyIdentity) {
    return formatDisplayName(legacyIdentity.platform, legacyIdentity.username);
  }

  return profile.display_name || 'Incognito';
}

export function getProfileIdentityLine(
  profile: Pick<
    Profile,
    | 'auth_provider'
    | 'public_identity_platform'
    | 'public_identity_username'
    | 'public_identity_source_url'
    | 'platform_username'
  >
): string {
  if (!isPublicIdentityComplete(profile)) {
    const legacyIdentity = getLegacyMappedIdentity(profile);
    if (!legacyIdentity) {
      return `${getAuthProviderLabel(profile.auth_provider)} login - Identity setup required`;
    }

    return `${getAuthProviderLabel(profile.auth_provider)} login - ${getPublicIdentityLabel(legacyIdentity.platform)} ${formatPlatformUsername(legacyIdentity.username) ?? ''}`.trim();
  }

  const currentIdentity = getPublicIdentity(profile);
  if (currentIdentity.platform === 'incognito') {
    return `${getAuthProviderLabel(profile.auth_provider)} login - Incognito`;
  }

  return `${getAuthProviderLabel(profile.auth_provider)} login - ${getPublicIdentityLabel(currentIdentity.platform)} ${formatPlatformUsername(currentIdentity.username) ?? ''}`.trim();
}

export function getPublicIdentitySummary(
  profile: Pick<
    Profile,
    | 'public_identity_platform'
    | 'public_identity_username'
    | 'public_identity_source_url'
    | 'auth_provider'
    | 'platform_username'
    | 'display_name'
  >
): {
  platform: PublicIdentityPlatform;
  platformLabel: string;
  username: string | null;
  displayName: string;
  summaryLabel: string;
  sourceUrl: string | null;
} {
  const identity = isPublicIdentityComplete(profile)
    ? getPublicIdentity(profile)
    : getLegacyMappedIdentity(profile) ?? { platform: 'incognito' as const, username: null, sourceUrl: null };

  return {
    platform: identity.platform,
    platformLabel: getPublicIdentityLabel(identity.platform),
    username: normalizePlatformUsername(identity.username),
    displayName: formatDisplayName(identity.platform, identity.username),
    summaryLabel: identity.platform === 'incognito'
      ? 'Incognito'
      : `${getPublicIdentityLabel(identity.platform)} ${formatPlatformUsername(identity.username) ?? ''}`.trim(),
    sourceUrl: identity.sourceUrl,
  };
}

export function isValidPublicUsername(username: string | null): username is string {
  return !!username && /^[A-Za-z0-9._]{1,30}$/.test(username);
}

export function normalizeIdentityInput(
  platform: Exclude<PublicIdentityPlatform, 'incognito'>,
  value: string
): { username: string; sourceUrl: string | null } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: `Enter your ${getPublicIdentityLabel(platform)} username or profile URL.` };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();
      const expectedHost = platform === 'instagram' ? 'instagram.com' : 'tiktok.com';
      if (!host.includes(expectedHost)) {
        return { error: `That does not look like a ${getPublicIdentityLabel(platform)} profile URL.` };
      }

      const parts = url.pathname
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
      const candidate = platform === 'tiktok'
        ? parts.find((part) => part.startsWith('@')) ?? parts.find(Boolean)
        : parts.find(Boolean);
      const username = normalizePlatformUsername(candidate ?? null);

      if (!isValidPublicUsername(username)) {
        return { error: `We could not read a valid ${getPublicIdentityLabel(platform)} username from that URL.` };
      }

      return {
        username,
        sourceUrl: trimmed,
      };
    } catch {
      return { error: 'That URL could not be parsed. Try a full profile URL or @username.' };
    }
  }

  const username = normalizePlatformUsername(trimmed);
  if (!isValidPublicUsername(username)) {
    return { error: `Enter a valid ${getPublicIdentityLabel(platform)} handle or profile URL.` };
  }

  return {
    username,
    sourceUrl: null,
  };
}

export function getDefaultIdentityDraft(
  profile: Pick<
    Profile,
    | 'auth_provider'
    | 'platform_username'
    | 'public_identity_platform'
    | 'public_identity_username'
    | 'public_identity_source_url'
  >
): {
  platform: PublicIdentityPlatform;
  input: string;
  sourceUrl: string | null;
  isResolved: boolean;
} {
  if (isPublicIdentityComplete(profile)) {
    const current = getPublicIdentity(profile);
    return {
      platform: current.platform,
      input: current.sourceUrl ?? formatPlatformUsername(current.username) ?? '',
      sourceUrl: current.sourceUrl,
      isResolved: true,
    };
  }

  const legacy = getLegacyMappedIdentity(profile);
  if (legacy) {
    return {
      platform: legacy.platform,
      input: formatPlatformUsername(legacy.username) ?? '',
      sourceUrl: legacy.sourceUrl,
      isResolved: false,
    };
  }

  return {
    platform: 'incognito',
    input: '',
    sourceUrl: null,
    isResolved: false,
  };
}

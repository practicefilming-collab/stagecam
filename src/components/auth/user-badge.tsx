'use client';

import type { Profile } from '@/lib/types';
import { getProviderColor } from '@/lib/auth/display-name';
import { getPublicIdentitySummary } from '@/lib/auth/identity';

export function UserBadge({ profile }: { profile: Profile }) {
  const identity = getPublicIdentitySummary(profile);
  const color = getProviderColor(identity.platform);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border"
      style={{ borderColor: color, color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {identity.displayName}
      <span className="text-[10px] opacity-70">{identity.platformLabel}</span>
    </span>
  );
}

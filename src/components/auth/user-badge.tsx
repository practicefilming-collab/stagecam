'use client';

import type { Profile } from '@/lib/types';
import { getProviderColor } from '@/lib/auth/display-name';

export function UserBadge({ profile }: { profile: Profile }) {
  const color = getProviderColor(profile.auth_provider);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border"
      style={{ borderColor: color, color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {profile.display_name}
    </span>
  );
}

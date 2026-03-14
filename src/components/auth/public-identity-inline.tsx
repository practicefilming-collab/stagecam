'use client';

import type { PublicIdentityPlatform } from '@/lib/types';

export function PublicIdentityIcon({
  platform,
  className = 'h-3.5 w-3.5',
}: {
  platform: PublicIdentityPlatform | null;
  className?: string;
}) {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={{ color: 'var(--instagram)' }}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.4" cy="6.7" r="1.1" fill="currentColor" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={{ color: 'var(--tiktok-teal)' }}>
          <path
            d="M14.3 3c.3 2.3 1.7 4 4.2 4.4v2.9c-1.5 0-2.9-.4-4.2-1.3v6.2a5.2 5.2 0 1 1-5.2-5.2c.4 0 .8 0 1.2.1v3a2.5 2.5 0 1 0 1.1 2.1V3h2.9Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'incognito':
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={{ color: 'var(--muted)' }}>
          <path
            d="M6.5 10.8 8.3 6h7.4l1.8 4.8M4 18.2c1.6-2.3 3.4-3.4 5.4-3.4 1.8 0 3.1.9 4.6 2.2 1.2-1.2 2.8-2.2 4.9-2.2 1.4 0 2.8.5 4.1 1.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9.2" cy="17.2" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.8" cy="17.2" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

export function PublicIdentityInline({
  platform,
  label,
  className = '',
  iconClassName,
}: {
  platform: PublicIdentityPlatform | null;
  label: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`.trim()}>
      <PublicIdentityIcon platform={platform} className={iconClassName} />
      <span className="truncate">{label}</span>
    </span>
  );
}

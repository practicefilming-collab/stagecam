'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getProviderColor } from '@/lib/auth/display-name';
import {
  formatPlatformUsername,
  getDefaultIdentityDraft,
  getPublicIdentityLabel,
  normalizeIdentityInput,
} from '@/lib/auth/identity';
import type { Profile, PublicIdentityPlatform } from '@/lib/types';

interface Props {
  profile: Profile;
  title: string;
  description: string;
  submitLabel: string;
  nextPath?: string;
}

function getPlatformIcon(platform: PublicIdentityPlatform) {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.4" cy="6.7" r="1.1" fill="currentColor" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
          <path
            d="M14.3 3c.3 2.3 1.7 4 4.2 4.4v2.9c-1.5 0-2.9-.4-4.2-1.3v6.2a5.2 5.2 0 1 1-5.2-5.2c.4 0 .8 0 1.2.1v3a2.5 2.5 0 1 0 1.1 2.1V3h2.9Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'incognito':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
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

function getInputConfig(platform: Exclude<PublicIdentityPlatform, 'incognito'>) {
  if (platform === 'instagram') {
    return {
      label: 'Instagram handle or profile URL',
      placeholder: '@stagecam or https://instagram.com/stagecam',
      hint: 'Paste your Instagram handle or a full profile URL. We will display the normalized @username.',
    };
  }

  return {
    label: 'TikTok handle or profile URL',
    placeholder: '@stagecam or https://www.tiktok.com/@stagecam',
    hint: 'Paste your TikTok handle or a full profile URL. We will display the normalized @username.',
  };
}

export function PublicIdentityEditor({
  profile,
  title,
  description,
  submitLabel,
  nextPath = '/menu',
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const draft = useMemo(() => getDefaultIdentityDraft(profile), [profile]);
  const [selected, setSelected] = useState<PublicIdentityPlatform>(draft.platform);
  const [inputs, setInputs] = useState<Record<Exclude<PublicIdentityPlatform, 'incognito'>, string>>({
    instagram: draft.platform === 'instagram' ? draft.input : '',
    tiktok: draft.platform === 'tiktok' ? draft.input : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeInput = selected === 'incognito' ? '' : inputs[selected];

  const preview = useMemo(() => {
    if (selected === 'incognito') {
      return {
        platform: 'incognito' as const,
        username: null,
        displayName: 'Incognito',
        isEmpty: false,
      };
    }

    if (!activeInput.trim()) {
      return {
        platform: selected,
        username: null,
        displayName: '',
        isEmpty: true,
      };
    }

    const parsed = normalizeIdentityInput(selected, activeInput);
    if ('error' in parsed) {
      return {
        platform: selected,
        username: null,
        displayName: '',
        isEmpty: true,
      };
    }

    return {
      platform: selected,
      username: parsed.username,
      displayName: formatPlatformUsername(parsed.username) ?? getPublicIdentityLabel(selected),
      isEmpty: false,
    };
  }, [activeInput, selected]);

  const handleSave = async () => {
    setSaving(true);
    setError('');

    let username: string | null = null;
    let sourceUrl: string | null = null;

    if (selected !== 'incognito') {
      const parsed = normalizeIdentityInput(selected, activeInput);
      if ('error' in parsed) {
        setError(parsed.error);
        setSaving(false);
        return;
      }

      username = parsed.username;
      sourceUrl = parsed.sourceUrl;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.push('/');
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        auth_provider: 'google',
        display_name: selected === 'incognito'
          ? 'Incognito'
          : (formatPlatformUsername(username) ?? 'Incognito'),
        public_identity_platform: selected,
        public_identity_username: username,
        public_identity_source_url: sourceUrl,
        platform_username: username,
      })
      .eq('id', authData.user.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gold mb-3">{title}</h1>
        <p className="text-sm text-muted max-w-2xl mx-auto">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(['instagram', 'tiktok', 'incognito'] as const).map((platform) => {
          const isSelected = selected === platform;
          const color = getProviderColor(platform);
          return (
            <button
              key={platform}
              type="button"
              onClick={() => {
                setSelected(platform);
                setError('');
              }}
              className={`rounded-2xl border p-5 text-left transition-all ${
                isSelected ? 'bg-gold/5 shadow-[0_0_0_1px_rgba(212,175,55,0.25)]' : 'bg-surface hover:border-gold/30'
              }`}
              style={{ borderColor: isSelected ? color : undefined }}
            >
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex items-center gap-3">
                  <span style={{ color }}>{getPlatformIcon(platform)}</span>
                <span className="text-lg font-semibold">{getPublicIdentityLabel(platform)}</span>
                </div>
                {isSelected && <span className="text-xs text-gold">Selected</span>}
              </div>
              <p className="text-sm text-muted">
                {platform === 'incognito'
                  ? 'Stay private in cast lists and playback labels.'
                  : `Show your ${getPublicIdentityLabel(platform)} handle as your public identity.`}
              </p>
            </button>
          );
        })}
      </div>

      {selected !== 'incognito' && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          {(() => {
            const config = getInputConfig(selected);
            return (
              <>
          <label className="block text-sm font-medium mb-2">
            {config.label}
          </label>
          <input
            type="text"
            value={activeInput}
            onChange={(event) => {
              setInputs((current) => ({
                ...current,
                [selected]: event.target.value,
              }));
            }}
            placeholder={config.placeholder}
            className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm placeholder:text-muted/40 focus:outline-none focus:border-gold/50"
          />
          <p className="text-xs text-muted mt-2">
            {config.hint}
          </p>
              </>
            );
          })()}
        </div>
      )}

      <div className="bg-surface border border-gold/20 rounded-2xl p-6">
        <h2 className="text-sm uppercase tracking-wider text-muted mb-4">Preview</h2>
        <div className="rounded-xl border border-border bg-background/50 p-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted uppercase tracking-wider">Display Name</span>
            <span className="text-sm font-medium">{preview.displayName || ' '}</span>
          </div>
          {preview.platform !== 'incognito' && !preview.isEmpty && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted uppercase tracking-wider">Platform</span>
              <span className="text-sm">{getPublicIdentityLabel(preview.platform)}</span>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl font-semibold bg-gold text-black hover:bg-gold-dim transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}

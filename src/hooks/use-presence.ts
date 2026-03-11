'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getPublicIdentitySummary } from '@/lib/auth/identity';
import type { RealtimePresenceState } from '@supabase/supabase-js';

export function usePresence(roomCode: string) {
  const [presenceState, setPresenceState] = useState<RealtimePresenceState>({});
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase.channel(`room:${roomCode}`, {
      config: { presence: { key: 'participants' } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setPresenceState(channel.presenceState());
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, auth_provider, platform_username, public_identity_platform, public_identity_username, public_identity_source_url')
            .eq('id', user.id)
            .single();

          const identity = profile
            ? getPublicIdentitySummary(profile)
            : {
                platform: 'incognito' as const,
                username: null,
                displayName: 'Incognito',
              };

          await channel.track({
            userId: user.id,
            displayName: identity.displayName,
            publicIdentityPlatform: identity.platform,
            publicIdentityUsername: identity.username,
            joinedAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, supabase]);

  return { presenceState };
}

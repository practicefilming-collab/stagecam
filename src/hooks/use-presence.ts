'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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
            .select('display_name')
            .eq('id', user.id)
            .single();

          await channel.track({
            userId: user.id,
            displayName: profile?.display_name ?? 'Unknown',
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

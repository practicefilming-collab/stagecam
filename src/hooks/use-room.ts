'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Room, RoomParticipant, Script, Act, Scene } from '@/lib/types';

export function useRoom(roomCode: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single();

      if (!roomData) return;
      setRoom(roomData);

      const [scriptRes, actsRes, participantsRes] = await Promise.all([
        supabase.from('scripts').select('*').eq('id', roomData.script_id).eq('is_internal', false).single(),
        supabase.from('acts').select('*').eq('script_id', roomData.script_id).order('act_number'),
        supabase.from('room_participants').select('*').eq('room_id', roomData.id),
      ]);

      setScript(scriptRes.data);
      setActs(actsRes.data ?? []);
      setParticipants(participantsRes.data ?? []);

      // Load scenes for selected act or all acts
      const actIds = (actsRes.data ?? []).map((a) => a.id);
      if (actIds.length > 0) {
        const { data: scenesData } = await supabase
          .from('scenes')
          .select('*')
          .in('act_id', actIds)
          .order('scene_number');
        setScenes(scenesData ?? []);
      }

      setLoading(false);
    }
    void load();
  }, [roomCode, supabase]);

  return { room, script, acts, scenes, participants, loading };
}

import { generateRoomCode } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function generateUniqueAuditionRoomCode(supabase: SupabaseClient) {
  let attempts = 0;

  while (attempts < 10) {
    const roomCode = generateRoomCode();
    const { data: existing } = await supabase
      .from('audition_room_sessions')
      .select('id')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (!existing) {
      return roomCode;
    }

    attempts += 1;
  }

  throw new Error('Unable to generate a unique audition room code');
}

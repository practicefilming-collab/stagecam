import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from './client';

export function createRoomChannel(roomCode: string): RealtimeChannel {
  const supabase = createClient();
  return supabase.channel(`room:${roomCode}`, {
    config: { presence: { key: 'participants' } },
  });
}

export function broadcastRoomStatus(
  roomCode: string,
  status: 'waiting' | 'active' | 'closed'
) {
  const supabase = createClient();
  supabase
    .channel(`room-status:${roomCode}`)
    .send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status },
    });
}

export function broadcastRecordingComplete(
  roomCode: string,
  userId: string,
  lineId: string
) {
  const supabase = createClient();
  supabase
    .channel(`room-status:${roomCode}`)
    .send({
      type: 'broadcast',
      event: 'recording_complete',
      payload: { userId, lineId, chunkId: lineId },
    });
}

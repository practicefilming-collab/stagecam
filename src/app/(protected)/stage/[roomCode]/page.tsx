'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/hooks/use-presence';
import type { Room, Script, RoomPresence } from '@/lib/types';

export default function WaitingRoomPage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const router = useRouter();
  const supabase = createClient();

  const [room, setRoom] = useState<Room | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const { presenceState } = usePresence(roomCode);

  useEffect(() => {
    async function loadRoom() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single();

      if (!roomData) {
        router.push('/menu');
        return;
      }

      setRoom(roomData);
      setIsCreator(roomData.creator_id === user.id);

      // Load script info
      const { data: scriptData } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', roomData.script_id)
        .single();
      setScript(scriptData);

      // Join as participant if not already
      await supabase.from('room_participants').upsert({
        room_id: roomData.id,
        user_id: user.id,
        is_creator: roomData.creator_id === user.id,
      }, { onConflict: 'room_id,user_id' });

      setLoading(false);

      // If room is already active, go to rehearse
      if (roomData.status === 'active') {
        router.push(`/stage/${roomCode}/rehearse`);
      }
    }
    loadRoom();
  }, [roomCode]);

  // Listen for room status changes
  useEffect(() => {
    const channel = supabase
      .channel(`room-status:${roomCode}`)
      .on('broadcast', { event: 'room_status' }, (payload) => {
        if (payload.payload.status === 'active') {
          router.push(`/stage/${roomCode}/rehearse`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomCode]);

  const startSession = async () => {
    if (!room) return;
    setStarting(true);

    // Update room status
    await supabase
      .from('rooms')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', room.id);

    // Broadcast to all participants
    await supabase
      .channel(`room-status:${roomCode}`)
      .send({ type: 'broadcast', event: 'room_status', payload: { status: 'active' } });

    router.push(`/stage/${roomCode}/rehearse`);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading room...</p>
      </div>
    );
  }

  const participants = Object.values(presenceState).flat() as unknown as RoomPresence[];

  return (
    <div className="max-w-lg mx-auto px-4 py-16 spotlight min-h-[calc(100vh-3.5rem)] text-center">
      <h1 className="text-2xl font-bold text-gold mb-2">Waiting Room</h1>
      <p className="text-muted mb-8">{script?.title} ({script?.year})</p>

      {/* Room Code */}
      <div className="mb-10">
        <p className="text-xs text-muted mb-2 uppercase tracking-wider">Room Code</p>
        <button
          onClick={copyCode}
          className="text-4xl font-mono font-bold tracking-[0.3em] text-gold hover:text-gold-dim transition-colors"
        >
          {roomCode}
        </button>
        <p className="text-xs text-muted mt-2">
          {copied ? 'Copied!' : 'Click to copy'}
        </p>
      </div>

      {/* Participants */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
        <h2 className="text-sm text-muted mb-4 uppercase tracking-wider">
          Cast ({participants.length})
        </h2>
        <div className="space-y-2">
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-background/50">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm">{p.displayName}</span>
            </div>
          ))}
          {participants.length === 0 && (
            <p className="text-muted text-sm">Waiting for participants...</p>
          )}
        </div>
      </div>

      {/* Start / Wait */}
      {isCreator ? (
        <button
          onClick={startSession}
          disabled={starting}
          className="w-full py-3 bg-gold text-black rounded-xl font-semibold text-lg hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          {starting ? 'Starting...' : `Start with ${Math.max(participants.length, 1)} performer${participants.length !== 1 ? 's' : ''}`}
        </button>
      ) : (
        <p className="text-muted text-sm">
          Waiting for the director to start the session...
        </p>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/hooks/use-presence';
import type { Room, Script, Act, Scene, RoomPresence } from '@/lib/types';

export default function WaitingRoomPage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const router = useRouter();
  const supabase = createClient();

  const [room, setRoom] = useState<Room | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedActId, setSelectedActId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
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

      // Load acts and scenes for pick mode
      const { data: actsData } = await supabase
        .from('acts')
        .select('*')
        .eq('script_id', roomData.script_id)
        .order('act_number');
      setActs(actsData ?? []);

      if (actsData && actsData.length > 0) {
        const actIds = actsData.map((a) => a.id);
        const { data: scenesData } = await supabase
          .from('scenes')
          .select('*')
          .in('act_id', actIds)
          .order('scene_number');
        setScenes(scenesData ?? []);
      }

      // Join as participant if not already
      await supabase.from('room_participants').upsert({
        room_id: roomData.id,
        user_id: user.id,
        is_creator: roomData.creator_id === user.id,
      }, { onConflict: 'room_id,user_id' });

      setLoading(false);

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
    setStartError('');

    // If pick mode, update room with selected act/scene first
    if (room.selection_mode === 'pick') {
      if (!selectedSceneId && !selectedActId) {
        setStartError('Please select a scene or act first');
        setStarting(false);
        return;
      }

      await supabase.from('rooms').update({
        selected_act_id: selectedActId,
        selected_scene_id: selectedSceneId,
      }).eq('id', room.id);
    }

    // Call the start API which runs chunk assignment
    const res = await fetch(`/api/rooms/${room.id}/start`, {
      method: 'POST',
    });

    if (!res.ok) {
      const data = await res.json();
      setStartError(data.error || 'Failed to start session');
      setStarting(false);
      return;
    }

    // Broadcast to all participants
    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status: 'active' },
    });

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
  const isPick = room?.selection_mode === 'pick';
  const filteredScenes = selectedActId
    ? scenes.filter((s) => s.act_id === selectedActId)
    : scenes;

  return (
    <div className="max-w-lg mx-auto px-4 py-16 spotlight min-h-[calc(100vh-3.5rem)] text-center">
      <h1 className="text-2xl font-bold text-gold mb-2">Waiting Room</h1>
      <p className="text-muted mb-8">{script?.title} ({script?.year})</p>

      {/* Room Code */}
      <div className="mb-8">
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

      {/* Pick Mode: Scene Selection */}
      {isPick && isCreator && (
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6 text-left">
          <h2 className="text-sm text-muted mb-3 uppercase tracking-wider">Select Scene</h2>

          {/* Act selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => { setSelectedActId(null); setSelectedSceneId(null); }}
              className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                !selectedActId ? 'border-gold text-gold bg-gold/10' : 'border-border text-muted hover:text-foreground'
              }`}
            >
              All Acts
            </button>
            {acts.map((act) => (
              <button
                key={act.id}
                onClick={() => { setSelectedActId(act.id); setSelectedSceneId(null); }}
                className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                  selectedActId === act.id ? 'border-gold text-gold bg-gold/10' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                Act {act.act_number}
              </button>
            ))}
          </div>

          {/* Scene list */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredScenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => {
                  setSelectedSceneId(scene.id);
                  setSelectedActId(scene.act_id);
                }}
                className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                  selectedSceneId === scene.id
                    ? 'bg-gold/10 border border-gold'
                    : 'bg-background/50 border border-transparent hover:border-border'
                }`}
              >
                <span className="text-muted text-xs mr-2">Scene {scene.scene_number}</span>
                <span className="text-foreground">{scene.scene_heading || 'Untitled'}</span>
                <span className="text-muted text-xs ml-2">({scene.total_chunks} chunks)</span>
                {scene.unique_characters.length > 0 && (
                  <div className="mt-1 text-xs text-gold/70">
                    {scene.unique_characters.join(', ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Participants */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
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

      {/* Error */}
      {startError && (
        <p className="text-red-400 text-sm mb-4">{startError}</p>
      )}

      {/* Start / Wait */}
      {isCreator ? (
        <button
          onClick={startSession}
          disabled={starting || (isPick && !selectedSceneId && !selectedActId)}
          className="w-full py-3 bg-gold text-black rounded-xl font-semibold text-lg hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          {starting ? 'Starting...' : isPick && !selectedSceneId ? 'Select a scene to start' : `Start with ${Math.max(participants.length, 1)} performer${participants.length !== 1 ? 's' : ''}`}
        </button>
      ) : (
        <p className="text-muted text-sm">
          Waiting for the director to start the session...
        </p>
      )}
    </div>
  );
}

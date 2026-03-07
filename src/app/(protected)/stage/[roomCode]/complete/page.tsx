'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ScenePlayer from '@/components/player/scene-player';

export default function CompletePage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const router = useRouter();
  const supabase = createClient();

  const [sceneId, setSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRoom() {
      const { data: room } = await supabase
        .from('rooms')
        .select('selected_scene_id')
        .eq('room_code', roomCode)
        .single();

      if (room?.selected_scene_id) {
        setSceneId(room.selected_scene_id);
      }
      setLoading(false);
    }
    loadRoom();
  }, [roomCode]);

  return (
    <div className="max-w-lg mx-auto px-4 py-8 spotlight min-h-[calc(100vh-3.5rem)]">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🎬</div>
        <h1 className="text-2xl font-bold text-gold mb-2">That's a Wrap!</h1>
        <p className="text-muted text-sm">
          Your recordings are in. Watch the full scene below.
        </p>
      </div>

      {/* Scene Player */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted">Loading...</p>
        </div>
      ) : sceneId ? (
        <ScenePlayer sceneId={sceneId} />
      ) : (
        <p className="text-muted text-center">No scene data available.</p>
      )}

      {/* Navigation */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => router.push(`/stage/${roomCode}`)}
          className="w-full py-3 bg-surface border border-border rounded-xl font-medium hover:border-gold/30 transition-colors"
        >
          Back to Stage
        </button>
        <button
          onClick={() => router.push('/menu')}
          className="w-full py-3 bg-gold text-black rounded-xl font-semibold hover:bg-gold-dim transition-colors"
        >
          Main Menu
        </button>
      </div>
    </div>
  );
}

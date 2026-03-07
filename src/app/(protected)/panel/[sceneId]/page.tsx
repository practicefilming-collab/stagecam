'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface RecordingWithMeta {
  id: string;
  video_url: string;
  user_id: string;
  chunks: {
    chunk_in_scene: number;
    type: string;
    character: string | null;
  };
  profiles: {
    display_name: string;
  };
}

export default function PanelViewerPage() {
  const params = useParams();
  const sceneId = params.sceneId as string;
  const supabase = createClient();

  const [recordings, setRecordings] = useState<RecordingWithMeta[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function load() {
      // Get all recordings for this scene, ordered by chunk position
      const { data } = await supabase
        .from('recordings')
        .select('*, chunks!inner(chunk_in_scene, type, character), profiles!inner(display_name)')
        .eq('chunks.scene_id', sceneId)
        .order('chunks.chunk_in_scene');

      // Deduplicate: pick one recording per chunk (prefer latest)
      const byChunk = new Map<number, RecordingWithMeta>();
      for (const rec of (data ?? []) as RecordingWithMeta[]) {
        const pos = rec.chunks.chunk_in_scene;
        byChunk.set(pos, rec); // last one wins (latest)
      }
      const ordered = [...byChunk.values()].sort(
        (a, b) => a.chunks.chunk_in_scene - b.chunks.chunk_in_scene
      );
      setRecordings(ordered);

      // Load user's likes
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userLikes } = await supabase
          .from('chunk_likes')
          .select('recording_id')
          .eq('user_id', user.id);
        setLikes(new Set((userLikes ?? []).map((l) => l.recording_id)));
      }

      setLoading(false);
    }
    load();
  }, [sceneId]);

  const currentRec = recordings[currentIdx];

  const getVideoUrl = (path: string) => {
    const { data } = supabase.storage.from('recordings').getPublicUrl(path);
    return data.publicUrl;
  };

  const toggleLike = async (recordingId: string) => {
    const res = await fetch('/api/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recording_id: recordingId }),
    });
    const { liked } = await res.json();
    setLikes((prev) => {
      const next = new Set(prev);
      if (liked) next.add(recordingId);
      else next.delete(recordingId);
      return next;
    });
  };

  const playNext = () => {
    if (currentIdx < recordings.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setPlaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading scene...</p>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">No recordings available for this scene yet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Video player */}
      <div className="flex-1 bg-black flex items-center justify-center relative">
        {currentRec && (
          <video
            ref={videoRef}
            src={getVideoUrl(currentRec.video_url)}
            className="max-h-[70vh] max-w-full"
            controls
            autoPlay={playing}
            onEnded={playNext}
          />
        )}

        {/* Chunk info overlay */}
        {currentRec && (
          <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2">
            <p className="text-sm font-medium">
              {currentRec.chunks.character && (
                <span className="text-gold mr-2">{currentRec.chunks.character}</span>
              )}
              <span className="text-muted text-xs">
                {currentRec.chunks.type} - performed by {currentRec.profiles.display_name}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-border bg-surface px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-surface-hover disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-sm text-muted">
              {currentIdx + 1} / {recordings.length}
            </span>
            <button
              onClick={() => setCurrentIdx((prev) => Math.min(recordings.length - 1, prev + 1))}
              disabled={currentIdx === recordings.length - 1}
              className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-surface-hover disabled:opacity-30"
            >
              Next
            </button>
          </div>

          <div className="flex items-center gap-4">
            {currentRec && (
              <button
                onClick={() => toggleLike(currentRec.id)}
                className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
                  likes.has(currentRec.id)
                    ? 'border-gold text-gold bg-gold/10'
                    : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {likes.has(currentRec.id) ? 'Liked' : 'Like'}
              </button>
            )}
            <button
              onClick={() => { setCurrentIdx(0); setPlaying(true); }}
              className="px-4 py-1 bg-gold text-black rounded-lg text-sm font-medium hover:bg-gold-dim"
            >
              Play All
            </button>
          </div>
        </div>

        {/* Cast list */}
        <div className="max-w-4xl mx-auto mt-4 pt-4 border-t border-border">
          <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Cast</h3>
          <div className="flex flex-wrap gap-2">
            {[...new Map(recordings.map((r) => [r.user_id, r])).values()].map((r) => (
              <span key={r.user_id} className="text-xs px-2 py-1 bg-background rounded-full border border-border">
                {r.profiles.display_name}
                {r.chunks.character && (
                  <span className="text-gold ml-1">as {r.chunks.character}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

interface PlaybackItem {
  chunkId: string;
  chunkIndex: number;
  chunkInScene: number;
  type: string;
  character: string | null;
  text: string;
  hasRecording: boolean;
  recordingUrl: string | null;
  recordingFormat: string | null;
  performerName: string | null;
  ttsUrl: string | null;
}

interface SceneInfo {
  id: string;
  sceneNumber: number;
  sceneHeading: string;
  actNumber: number;
  scriptTitle: string;
  scriptYear: number;
}

interface ScenePlayerProps {
  sceneId: string;
}

export default function ScenePlayer({ sceneId }: ScenePlayerProps) {
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [items, setItems] = useState<PlaybackItem[]>([]);
  const [stats, setStats] = useState({ totalChunks: 0, recordedChunks: 0, ttsChunks: 0 });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load playback data
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/scenes/${sceneId}/playback`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load scene');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setScene(data.scene);
      setItems(data.items);
      setStats(data.stats);
      setLoading(false);
    }
    load();
  }, [sceneId]);

  const current = items[currentIdx] ?? null;

  const playNext = () => {
    if (currentIdx < items.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setPlaying(false);
    }
  };

  // Auto-play current item when it changes
  useEffect(() => {
    if (!playing || !current) return;

    if (current.hasRecording && current.recordingUrl && videoRef.current) {
      videoRef.current.src = current.recordingUrl;
      videoRef.current.play().catch(() => {});
    } else if (current.ttsUrl && audioRef.current) {
      audioRef.current.src = current.ttsUrl;
      audioRef.current.play().catch(() => {});
    } else {
      // No media — show text for 3 seconds then advance
      const timer = setTimeout(playNext, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentIdx, playing]);

  const handlePlay = () => {
    setPlaying(true);
    setCurrentIdx(0);
  };

  const handlePause = () => {
    setPlaying(false);
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  };

  const handleSkip = () => {
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
    playNext();
  };

  const handleSeek = (idx: number) => {
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
    setCurrentIdx(idx);
    if (playing) {
      // Will auto-play via the effect
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted">Loading scene...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const progress = items.length > 0 ? ((currentIdx + 1) / items.length) * 100 : 0;

  return (
    <div className="flex flex-col bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Scene header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gold text-sm font-medium">
              Act {scene?.actNumber} &middot; Scene {scene?.sceneNumber}
            </p>
            <p className="text-xs text-muted">{scene?.sceneHeading}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">
              {stats.recordedChunks} recorded / {stats.totalChunks} total
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-border rounded-full mt-2">
          <div
            className="h-full bg-gold rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Media area */}
      <div className="relative bg-black aspect-[9/16] max-h-[50vh] mx-auto w-full">
        {/* Video for recordings */}
        <video
          ref={videoRef}
          playsInline
          onEnded={playNext}
          className={`w-full h-full object-contain ${
            current?.hasRecording && playing ? '' : 'hidden'
          }`}
        />

        {/* Audio for TTS (hidden element) */}
        <audio ref={audioRef} onEnded={playNext} />

        {/* Text display — shown during TTS or when no media */}
        {(!current?.hasRecording || !playing) && current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            {current.type === 'scene_heading' && (
              <p className="text-gold text-xs uppercase tracking-wider mb-4">
                Scene Heading
              </p>
            )}
            {current.character && (
              <p className="text-gold font-semibold mb-3 text-lg">
                {current.character}
              </p>
            )}
            <p className="text-white text-base leading-relaxed whitespace-pre-wrap max-w-md">
              {current.text}
            </p>
            {current.hasRecording && current.performerName && (
              <p className="text-gold/60 text-xs mt-4">
                Performed by {current.performerName}
              </p>
            )}
            {!current.hasRecording && (
              <p className="text-muted text-xs mt-4">TTS Audio</p>
            )}
          </div>
        )}

        {/* Performer badge on video */}
        {current?.hasRecording && playing && current.performerName && (
          <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded-full z-10">
            <span className="text-gold text-xs">{current.performerName}</span>
            {current.character && (
              <span className="text-muted text-xs ml-1">as {current.character}</span>
            )}
          </div>
        )}
      </div>

      {/* Script text below video during recording playback */}
      {current?.hasRecording && playing && (
        <div className="px-4 py-3 bg-background/50 border-t border-border">
          {current.character && (
            <span className="text-gold text-xs font-semibold mr-2">{current.character}</span>
          )}
          <span className="text-sm text-muted">{current.text}</span>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted">
          {currentIdx + 1} / {items.length}
        </span>

        <div className="flex items-center gap-3">
          {!playing ? (
            <button
              onClick={handlePlay}
              className="px-6 py-2 bg-gold text-black rounded-full font-medium text-sm hover:bg-gold-dim transition-colors"
            >
              {currentIdx > 0 ? 'Resume' : 'Play Scene'}
            </button>
          ) : (
            <>
              <button
                onClick={handlePause}
                className="px-4 py-2 bg-surface border border-border rounded-full text-sm hover:bg-surface-hover transition-colors"
              >
                Pause
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2 bg-surface border border-border rounded-full text-sm hover:bg-surface-hover transition-colors"
              >
                Skip
              </button>
            </>
          )}
        </div>

        <span className="text-xs text-muted">
          {current?.type}
        </span>
      </div>

      {/* Chunk timeline */}
      <div className="px-4 py-2 border-t border-border flex gap-0.5 overflow-x-auto">
        {items.map((item, i) => (
          <button
            key={item.chunkId}
            onClick={() => handleSeek(i)}
            className={`flex-shrink-0 h-2 rounded-full transition-all ${
              i === currentIdx
                ? 'w-6 bg-gold'
                : item.hasRecording
                ? 'w-2 bg-green-500/60 hover:bg-green-500'
                : 'w-2 bg-border hover:bg-muted'
            }`}
            title={`${item.type}${item.character ? ` - ${item.character}` : ''}${item.hasRecording ? ' (recorded)' : ' (TTS)'}`}
          />
        ))}
      </div>
    </div>
  );
}

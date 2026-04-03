/** Sequential scene playback: recordings → TTS fallback → text display. System lines are badged as Narrator. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PlaybackItem {
  lineId: string;
  lineIndex: number;
  lineInScene: number;
  type: string;
  character: string | null;
  isSystem: boolean;
  text: string;
  hasRecording: boolean;
  recordingUrl: string | null;
  recordingFormat: string | null;
  performerName: string | null;
  fallbackSource: 'performer' | 'cover' | 'tts' | 'text';
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
  initialLineId?: string | null;
}

interface ExportJobStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired';
  progressPct: number;
  errorMessage: string | null;
  downloadUrl: string | null;
}

export default function ScenePlayer({ sceneId, initialLineId }: ScenePlayerProps) {
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [items, setItems] = useState<PlaybackItem[]>([]);
  const [stats, setStats] = useState({ totalLines: 0, rehearsableLines: 0, recordedLines: 0, ttsLines: 0, systemLines: 0 });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(initialLineId ?? null);

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

  useEffect(() => {
    setFocusedLineId(initialLineId ?? null);
  }, [initialLineId]);

  useEffect(() => {
    if (!initialLineId || items.length === 0) return;
    const targetIdx = items.findIndex((item) => item.lineId === initialLineId);
    if (targetIdx >= 0) {
      setCurrentIdx(targetIdx);
      setFocusedLineId(initialLineId);
    }
  }, [initialLineId, items]);

  const current = items[currentIdx] ?? null;
  const currentRecordingIsAudio = Boolean(
    current?.hasRecording && current.recordingFormat && current.recordingFormat.startsWith('audio/')
  );

  const playNext = useCallback(() => {
    if (currentIdx < items.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setPlaying(false);
    }
  }, [currentIdx, items.length]);

  // Auto-play current item when it changes
  useEffect(() => {
    if (!playing || !current) return;

    if (current.hasRecording && current.recordingUrl) {
      if (currentRecordingIsAudio && audioRef.current) {
        audioRef.current.src = current.recordingUrl;
        audioRef.current.play().catch(() => {});
      } else if (videoRef.current) {
        videoRef.current.src = current.recordingUrl;
        videoRef.current.play().catch(() => {});
      }
    } else if (current.ttsUrl && audioRef.current) {
      audioRef.current.src = current.ttsUrl;
      audioRef.current.play().catch(() => {});
    } else {
      // No media — show text for 3 seconds then advance
      const timer = setTimeout(playNext, 3000);
      return () => clearTimeout(timer);
    }
  }, [current, currentRecordingIsAudio, playNext, playing]);

  const handlePlay = () => {
    setPlaying(true);
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

  const handleDownload = async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      setDownloading(true);
      setDownloadError('');
      setDownloadProgress(0);

      const createRes = await fetch(`/api/scenes/${sceneId}/exports`, { method: 'POST' });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        setDownloadError(data.error || 'Failed to queue export');
        return;
      }
      const created = await createRes.json();
      const jobId = created.jobId as string;
      if (!jobId) {
        setDownloadError('Invalid export job response');
        return;
      }

      // Best-effort kickoff; status polling will continue regardless.
      void fetch(`/api/exports/${jobId}/kickoff`, { method: 'POST' }).catch(() => {});

      for (let i = 0; i < 180; i += 1) {
        const statusRes = await fetch(`/api/exports/${jobId}`);
        if (!statusRes.ok) {
          const data = await statusRes.json().catch(() => ({}));
          setDownloadError(data.error || 'Failed to fetch export status');
          return;
        }

        const statusData: ExportJobStatusResponse = await statusRes.json();
        setDownloadProgress(statusData.progressPct ?? 0);

        if (statusData.status === 'succeeded' && statusData.downloadUrl) {
          const anchor = document.createElement('a');
          anchor.href = statusData.downloadUrl;
          anchor.rel = 'noopener';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setDownloadProgress(100);
          return;
        }

        if (statusData.status === 'failed') {
          setDownloadError(statusData.errorMessage || 'Export failed');
          return;
        }

        if (statusData.status === 'expired') {
          setDownloadError('Export expired. Try again.');
          return;
        }

        if (statusData.status === 'queued' && i > 2 && i % 10 === 0) {
          void fetch(`/api/exports/${jobId}/kickoff`, { method: 'POST' }).catch(() => {});
        }

        await wait(2000);
      }

      setDownloadError('Export timed out. Please try again.');
    } catch {
      setDownloadError('Download failed');
    } finally {
      setDownloading(false);
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
              {stats.recordedLines} recorded / {stats.rehearsableLines} rehearsable
            </p>
          </div>
        </div>
        {focusedLineId && current?.lineId === focusedLineId && (
          <p className="text-xs text-gold mt-2">
            Focused review line {current.lineInScene}
            {current.character ? ` · ${current.character}` : ' · Narrator'}
          </p>
        )}
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
        {(!current?.hasRecording || !playing || currentRecordingIsAudio) && current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            {current.isSystem && (
              <p className="text-gold/50 text-xs uppercase tracking-wider mb-4">
                Narrator
              </p>
            )}
            {!current.isSystem && current.type === 'scene_heading' && (
              <p className="text-gold text-xs uppercase tracking-wider mb-4">
                Scene Heading
              </p>
            )}
            {current.character && (
              <p className="text-gold font-semibold mb-3 text-lg">
                {current.character}
              </p>
            )}
            <p className="text-white text-base leading-relaxed max-w-md">
              {current.text}
            </p>
            {current.hasRecording && current.performerName && (
              <p className="text-gold/60 text-xs mt-4">
                {current.fallbackSource === 'cover' ? 'Covered' : 'Performed'} by {current.performerName}
              </p>
            )}
            {!current.hasRecording && !current.isSystem && (
              <p className="text-muted text-xs mt-4">TTS Audio</p>
            )}
          </div>
        )}

        {/* Performer badge on video */}
        {current?.hasRecording && playing && current.performerName && !currentRecordingIsAudio && (
          <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded-full z-10">
            <span className="text-gold text-xs">
              {current.fallbackSource === 'cover' ? 'Covered by ' : ''}{current.performerName}
            </span>
            {current.character && (
              <span className="text-muted text-xs ml-1">as {current.character}</span>
            )}
          </div>
        )}
      </div>

      {/* Script text below video during recording playback */}
      {current?.hasRecording && playing && !currentRecordingIsAudio && (
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
          <button
            onClick={handleDownload}
            disabled={downloading}
            title="Download full scene"
            aria-label="Download full scene"
            className="w-9 h-9 inline-flex items-center justify-center bg-surface border border-border rounded-full hover:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {downloading ? (
              <span className="text-[10px] text-muted">
                {downloadProgress !== null ? `${Math.max(0, Math.min(99, downloadProgress))}%` : '...'}
              </span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-gold" aria-hidden="true">
                <path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v3h14v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

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

      {downloadError && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-400">{downloadError}</p>
        </div>
      )}

      {/* Line timeline */}
      <div className="px-4 py-2 border-t border-border flex gap-0.5 overflow-x-auto">
        {items.map((item, i) => (
          <button
            key={item.lineId}
            onClick={() => handleSeek(i)}
            className={`flex-shrink-0 h-2 rounded-full transition-all ${
              i === currentIdx
                ? 'w-6 bg-gold'
                : focusedLineId === item.lineId
                ? 'w-3 bg-gold/70 hover:bg-gold'
                : item.isSystem
                ? 'w-2 bg-gold/30 hover:bg-gold/50'
                : item.hasRecording
                ? 'w-2 bg-green-500/60 hover:bg-green-500'
                : 'w-2 bg-border hover:bg-muted'
            }`}
            title={`${item.type}${item.character ? ` - ${item.character}` : ''}${item.isSystem ? ' (narrator)' : item.hasRecording ? ' (recorded)' : ' (TTS)'}`}
          />
        ))}
      </div>
    </div>
  );
}

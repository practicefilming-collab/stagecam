'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditionTakePlaybackData, AuditionTakePlaybackItem } from '@/lib/auditions/build-take-playback';

interface ReplayExportStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired';
  progressPct: number;
  errorMessage: string | null;
  downloadUrl: string | null;
}

export function AuditionTakePlayer({
  auditionId,
  sceneId,
  takeId,
}: {
  auditionId: string;
  sceneId: string;
  takeId: string;
}) {
  const [data, setData] = useState<AuditionTakePlaybackData | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/auditions/takes/${takeId}/playback`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error || 'Failed to load rehearsal replay');
        setLoading(false);
        return;
      }

      const payload = await res.json();
      setData(payload);
      setLoading(false);
    }

    void load();
  }, [takeId]);

  const items = data?.items ?? [];
  const current = items[currentIdx] ?? null;
  const currentRecordingIsAudio = Boolean(
    current?.hasRecording && current.recordingFormat && current.recordingFormat.startsWith('audio/'),
  );

  const playNext = useCallback(() => {
    if (currentIdx < items.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setPlaying(false);
    }
  }, [currentIdx, items.length]);

  useEffect(() => {
    if (!playing || !current) return;

    if (current.hasRecording && current.recordingUrl) {
      if (currentRecordingIsAudio && audioRef.current) {
        audioRef.current.src = current.recordingUrl;
        audioRef.current.play().catch(() => undefined);
      } else if (videoRef.current) {
        videoRef.current.src = current.recordingUrl;
        videoRef.current.play().catch(() => undefined);
      }
      return;
    }

    if (current.ttsUrl && audioRef.current) {
      audioRef.current.src = current.ttsUrl;
      audioRef.current.play().catch(() => undefined);
      return;
    }

    const timer = window.setTimeout(playNext, 3000);
    return () => window.clearTimeout(timer);
  }, [current, currentRecordingIsAudio, playNext, playing]);

  const handlePause = () => {
    setPlaying(false);
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  };

  const handleSeek = (idx: number) => {
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
    setCurrentIdx(idx);
  };

  const handleDownload = async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      setDownloading(true);
      setDownloadError('');
      setDownloadProgress(0);

      const createRes = await fetch(`/api/auditions/takes/${takeId}/exports`, { method: 'POST' });
      if (!createRes.ok) {
        const payload = await createRes.json().catch(() => ({}));
        setDownloadError(payload.error || 'Failed to queue replay export');
        return;
      }

      const created = await createRes.json();
      const jobId = created.jobId as string | undefined;
      if (!jobId) {
        setDownloadError('Invalid replay export response');
        return;
      }

      void fetch(`/api/auditions/exports/${jobId}/kickoff`, { method: 'POST' }).catch(() => undefined);

      for (let i = 0; i < 180; i += 1) {
        const statusRes = await fetch(`/api/auditions/exports/${jobId}`);
        if (!statusRes.ok) {
          const payload = await statusRes.json().catch(() => ({}));
          setDownloadError(payload.error || 'Failed to fetch replay export status');
          return;
        }

        const statusData = await statusRes.json() as ReplayExportStatusResponse;
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
          setDownloadError(statusData.errorMessage || 'Replay export failed');
          return;
        }

        if (statusData.status === 'expired') {
          setDownloadError('Replay export expired. Try again.');
          return;
        }

        if (statusData.status === 'queued' && i > 2 && i % 10 === 0) {
          void fetch(`/api/auditions/exports/${jobId}/kickoff`, { method: 'POST' }).catch(() => undefined);
        }

        await wait(2000);
      }

      setDownloadError('Replay export timed out. Please try again.');
    } catch {
      setDownloadError('Replay download failed');
    } finally {
      setDownloading(false);
    }
  };

  const renderCurrentText = (item: AuditionTakePlaybackItem) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
      {item.isSystem && (
        <p className="mb-4 text-xs uppercase tracking-wider text-gold/50">
          Narrator
        </p>
      )}
      {item.character && (
        <p className="mb-3 text-lg font-semibold text-gold">
          {item.character}
        </p>
      )}
      <p className="max-w-md text-base leading-relaxed text-white">
        {item.text}
      </p>
      {item.hasRecording && item.performerName && (
        <p className="mt-4 text-xs text-gold/60">
          {item.fallbackSource === 'cover' ? 'Covered' : 'Performed'} by {item.performerName}
        </p>
      )}
      {!item.hasRecording && (
        <p className="mt-4 text-xs text-muted">
          {item.ttsUrl ? 'Level 2 shared cue audio' : 'Fallback scene text'}
        </p>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted">Loading rehearsal replay...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-red-400">{error || 'Rehearsal replay unavailable'}</p>
      </div>
    );
  }

  const progress = items.length > 0 ? ((currentIdx + 1) / items.length) * 100 : 0;
  const takeLabel = data.take.title ?? `Rehearsal ${data.take.id.slice(0, 8)}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Rehearsal replay</p>
          <h1 className="mt-2 text-3xl font-bold text-gold">{takeLabel}</h1>
          <p className="mt-2 text-sm text-muted">
            {data.script.title} • {data.scene.label}
            {data.scene.sourcePageRef ? ` • ${data.scene.sourcePageRef}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            {downloading
              ? `Downloading${downloadProgress !== null ? ` ${Math.max(0, Math.min(99, downloadProgress))}%` : '...'}`
              : 'Download replay'}
          </button>
          <Link
            href={`/pro/auditions/${auditionId}/scenes/${sceneId}`}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Back to scene
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gold">
                Scene {data.scene.orderIndex + 1}
              </p>
              <p className="text-xs text-muted">{data.scene.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">
                {data.stats.recordedLines} recorded / {data.stats.rehearsableLines} rehearsable
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-gold/80">{data.take.status}</p>
            </div>
          </div>
          <div className="mt-2 h-1 rounded-full bg-border">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {data.participantProgress.length > 0 && (
          <div className="border-b border-border bg-background/40 px-4 py-4">
            <div className="text-xs uppercase tracking-wide text-gold/80">Participant upload progress</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {data.participantProgress.map((participant) => (
                <div key={participant.userId} className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{participant.displayName ?? participant.userId}</div>
                    <div className="text-xs uppercase tracking-wide text-muted">{participant.status.replace(/_/g, ' ')}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {participant.uploadedLineCount}/{participant.assignedLineCount} uploaded
                    {participant.remainingLineCount > 0 ? ` • ${participant.remainingLineCount} still using fallback` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative mx-auto aspect-[9/16] max-h-[50vh] w-full bg-black">
          <video
            ref={videoRef}
            playsInline
            onEnded={playNext}
            className={`h-full w-full object-contain ${current?.hasRecording && playing ? '' : 'hidden'}`}
          />
          <audio ref={audioRef} onEnded={playNext} />
          {current && (!current.hasRecording || !playing || currentRecordingIsAudio) && renderCurrentText(current)}

          {current?.hasRecording && playing && current.performerName && !currentRecordingIsAudio && (
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 py-1">
              <span className="text-xs text-gold">
                {current.fallbackSource === 'cover' ? 'Covered by ' : ''}{current.performerName}
              </span>
              {current.character && (
                <span className="ml-1 text-xs text-muted">as {current.character}</span>
              )}
            </div>
          )}
        </div>

        {current?.hasRecording && playing && !currentRecordingIsAudio && (
          <div className="border-t border-border bg-background/50 px-4 py-3">
            {current.character && <span className="mr-2 text-xs font-semibold text-gold">{current.character}</span>}
            <span className="text-sm text-muted">{current.text}</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-muted">
            {currentIdx + 1} / {items.length}
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {downloading ? `${Math.max(0, Math.min(99, downloadProgress ?? 0))}%` : 'Download'}
            </button>
            {!playing ? (
              <button
                onClick={() => setPlaying(true)}
                className="rounded-full bg-gold px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-gold-dim"
              >
                {currentIdx > 0 ? 'Resume' : 'Play Scene'}
              </button>
            ) : (
              <>
                <button
                  onClick={handlePause}
                  className="rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:bg-surface-hover"
                >
                  Pause
                </button>
                <button
                  onClick={() => {
                    if (videoRef.current) videoRef.current.pause();
                    if (audioRef.current) audioRef.current.pause();
                    playNext();
                  }}
                  className="rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:bg-surface-hover"
                >
                  Skip
                </button>
              </>
            )}
          </div>

          <span className="text-xs text-muted">{current?.type}</span>
        </div>

        {downloadError && (
          <div className="px-4 pb-2">
            <p className="text-xs text-red-400">{downloadError}</p>
          </div>
        )}

        <div className="flex gap-0.5 overflow-x-auto border-t border-border px-4 py-2">
          {items.map((item, idx) => (
            <button
              key={item.lineId}
              onClick={() => handleSeek(idx)}
              className={`h-2 flex-shrink-0 rounded-full transition-all ${
                idx === currentIdx
                  ? 'w-6 bg-gold'
                  : item.isSystem
                    ? 'w-2 bg-gold/30 hover:bg-gold/50'
                    : item.hasRecording
                      ? 'w-2 bg-green-500/60 hover:bg-green-500'
                      : 'w-2 bg-border hover:bg-muted'
              }`}
              title={`${item.type}${item.character ? ` - ${item.character}` : ''}${item.isSystem ? ' (narrator)' : item.hasRecording ? ' (recorded)' : ' (fallback)'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

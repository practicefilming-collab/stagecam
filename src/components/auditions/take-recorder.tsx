'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMediaDevices } from '@/hooks/use-media-devices';
import { useRecording } from '@/hooks/use-recording';
import type { AuditionTakePlaybackItem } from '@/lib/auditions/build-take-playback';
import type { AuditionParticipantRehearsalProgress } from '@/lib/auditions/rehearsal-progress';
import { parseAuditionSceneRuntimeLines, runtimeLinesForAssignments } from '@/lib/auditions/scene-runtime';
import type { AuditionTakeDetail } from '@/lib/auditions/data';
import type { AuditionScene, AuditionTakeClip } from '@/lib/types';

type SceneInput = Pick<AuditionScene, 'id' | 'label' | 'scene_text'>;

export function AuditionTakeRecorder({
  roomCode,
  take,
  scene,
  viewerUserId,
  canControlTake,
}: {
  roomCode: string;
  take: AuditionTakeDetail;
  scene: SceneInput;
  viewerUserId: string;
  canControlTake: boolean;
}) {
  const router = useRouter();
  const { stream, error: mediaError, hasPermission, videoRef, requestPermission } = useMediaDevices();
  const { state: recState, blob, previewUrl, duration, startRecording, stopRecording, reset } = useRecording();
  const playbackRef = useRef<HTMLVideoElement>(null);
  const cueAudioRef = useRef<HTMLAudioElement>(null);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [playbackItemsBySequence, setPlaybackItemsBySequence] = useState<Map<number, AuditionTakePlaybackItem>>(new Map());
  const [playingCueSequence, setPlayingCueSequence] = useState<number | null>(null);
  const [uploadedSequenceIndexes, setUploadedSequenceIndexes] = useState<Set<number>>(
    new Set(
      take.clips
        .filter((clip: AuditionTakeClip) => clip.actor_user_id === viewerUserId)
        .map((clip) => clip.sequence_index),
    ),
  );

  const assignedLines = useMemo(
    () => runtimeLinesForAssignments(scene.scene_text, take.assignments, viewerUserId),
    [scene.scene_text, take.assignments, viewerUserId],
  );

  const firstOpenIndex = useMemo(
    () => assignedLines.findIndex((line) => !uploadedSequenceIndexes.has(line.sequenceIndex)),
    [assignedLines, uploadedSequenceIndexes],
  );

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() => undefined);
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (firstOpenIndex >= 0) {
      setCurrentLineIdx(firstOpenIndex);
    }
  }, [firstOpenIndex]);

  useEffect(() => {
    const loadPlayback = async () => {
      const res = await fetch(`/api/auditions/takes/${take.id}/playback`);
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      const items = Array.isArray(payload?.items) ? payload.items as AuditionTakePlaybackItem[] : [];
      setPlaybackItemsBySequence(new Map(items.map((item) => [item.lineIndex, item])));
    };

    void loadPlayback();
  }, [take.id]);

  const currentLine = assignedLines[currentLineIdx] ?? null;
  const sceneRuntime = useMemo(() => parseAuditionSceneRuntimeLines(scene.scene_text), [scene.scene_text]);
  const currentPlaybackItem = currentLine ? playbackItemsBySequence.get(currentLine.sequenceIndex) ?? null : null;
  const myProgress = take.participantProgress.find((item) => item.userId === viewerUserId) ?? null;
  const participantState: AuditionParticipantRehearsalProgress['status'] = uploadedSequenceIndexes.size >= assignedLines.length
    ? 'complete'
    : uploading || recState === 'recorded'
      ? 'awaiting_uploads'
      : recState === 'recording'
        ? 'recording'
        : 'recording';

  useEffect(() => {
    const syncParticipantState = async () => {
      await fetch(`/api/audition-rooms/${roomCode}/participants/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_state: participantState,
          take_id: take.id,
        }),
      }).catch(() => undefined);
    };

    void syncParticipantState();
    const interval = window.setInterval(() => void syncParticipantState(), 6000);
    return () => window.clearInterval(interval);
  }, [participantState, roomCode, take.id]);

  const playCue = (sequenceIndex: number) => {
    const item = playbackItemsBySequence.get(sequenceIndex);
    const url = item?.ttsUrl ?? item?.recordingUrl ?? null;
    if (!url || !cueAudioRef.current) return;
    cueAudioRef.current.pause();
    cueAudioRef.current.src = url;
    setPlayingCueSequence(sequenceIndex);
    void cueAudioRef.current.play().catch(() => setPlayingCueSequence(null));
  };

  const uploadClip = async () => {
    if (!blob || !currentLine) return;
    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.set('file', new File([blob], `take-${take.id}-${currentLine.sequenceIndex}.webm`, { type: blob.type || 'video/webm' }));
    formData.set('role_name', currentLine.roleName ?? '');
    formData.set('line_text', currentLine.text);
    formData.set('sequence_index', String(currentLine.sequenceIndex));
    formData.set('duration_seconds', String(duration));

    const res = await fetch(`/api/auditions/takes/${take.id}/clips`, {
      method: 'POST',
      body: formData,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || 'Could not upload clip');
      setUploading(false);
      return;
    }

    setUploadedSequenceIndexes((current) => new Set([...current, currentLine.sequenceIndex]));
    reset();
    setUploading(false);
    router.refresh();
  };

  if (assignedLines.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="rounded-3xl border border-border bg-surface p-6">
          <h1 className="text-2xl font-semibold text-gold">No human lines assigned in this rehearsal</h1>
          <p className="mt-2 text-sm text-muted">
            Your role in this rehearsal is observer-only or handled through fallback audio. Return to the room to review the cast plan.
          </p>
          <div className="mt-4">
            <Link href={`/rooms/auditions/${roomCode}`} className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground">
              Back to room
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background" style={{ paddingTop: '3.5rem' }}>
      <div className="h-1 bg-border flex-shrink-0">
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${((currentLineIdx + 1) / assignedLines.length) * 100}%` }}
        />
      </div>

      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <div className="text-sm text-muted">{scene.label} | Rehearsal {take.title ?? take.id.slice(0, 8)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-gold/80">
            My line {currentLineIdx + 1}/{assignedLines.length}
          </div>
        </div>
        <Link href={`/rooms/auditions/${roomCode}`} className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
          Back to room
        </Link>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="relative bg-black flex-shrink-0 overflow-hidden" style={{ height: '32vh' }}>
          <audio
            ref={cueAudioRef}
            onEnded={() => setPlayingCueSequence(null)}
            onPause={() => setPlayingCueSequence(null)}
          />
          <video
            key="live-camera"
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ display: recState === 'recorded' ? 'none' : 'block' }}
            className="absolute inset-0 w-full h-full object-contain"
          />
          {recState === 'recorded' && previewUrl && (
            <video
              key="playback"
              ref={playbackRef}
              src={previewUrl}
              controls
              playsInline
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}
          {mediaError && recState !== 'recorded' && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-300">
              {mediaError}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-8">
            <section>
              <div className="text-xs uppercase tracking-wide text-gold/80">Current line</div>
              <div className="mt-2 text-lg font-semibold">{currentLine?.roleName}</div>
              <p className="mt-3 whitespace-pre-wrap text-base leading-8">{currentLine?.text}</p>
              {currentPlaybackItem?.ttsUrl && (
                <button
                  onClick={() => playCue(currentLine.sequenceIndex)}
                  className="mt-4 rounded-xl border border-gold/30 px-4 py-2 text-sm text-gold hover:bg-gold/10"
                >
                  {playingCueSequence === currentLine.sequenceIndex ? 'Playing cue...' : 'Play Level 1 cue'}
                </button>
              )}
            </section>

            <section>
              <div className="text-xs uppercase tracking-wide text-muted">Scene continuity</div>
              <div className="mt-3 space-y-2">
                {sceneRuntime.map((line) => (
                  <div
                    key={line.sequenceIndex}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      line.sequenceIndex === currentLine?.sequenceIndex
                        ? 'border-gold/40 bg-gold/10'
                        : uploadedSequenceIndexes.has(line.sequenceIndex)
                          ? 'border-green-500/20 bg-green-500/5'
                          : 'border-border bg-background/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-wide text-muted">
                        {line.roleName ?? 'Cue'}
                      </div>
                      {(playbackItemsBySequence.get(line.sequenceIndex)?.ttsUrl || playbackItemsBySequence.get(line.sequenceIndex)?.recordingUrl) && (
                        <button
                          onClick={() => playCue(line.sequenceIndex)}
                          className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:text-foreground"
                        >
                          {playingCueSequence === line.sequenceIndex ? 'Playing...' : 'Play'}
                        </button>
                      )}
                    </div>
                    <div className="mt-1">{line.text}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="text-xs uppercase tracking-wide text-gold/80">Assigned roles</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {take.assignments
                  .filter((assignment) => assignment.user_id === viewerUserId && assignment.assignment_type === 'human')
                  .map((assignment) => (
                    <span key={assignment.id} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">
                      {assignment.role_name}
                    </span>
                  ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-background/40 px-4 py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">My upload status</div>
                <div className="text-xs uppercase tracking-wide text-muted">{(myProgress?.status ?? participantState).replace(/_/g, ' ')}</div>
              </div>
              <div className="mt-2 text-xs text-muted">
                {uploadedSequenceIndexes.size}/{assignedLines.length} uploaded
              </div>
            </section>

            <section>
              <div className="text-xs uppercase tracking-wide text-muted">Recorded clips</div>
              <div className="mt-3 space-y-2">
                {take.clips
                  .filter((clip) => clip.actor_user_id === viewerUserId)
                  .map((clip) => (
                    <div key={clip.id} className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
                      <div className="font-medium">{clip.role_name}</div>
                      <div className="mt-1 text-xs text-muted">{clip.line_text}</div>
                    </div>
                  ))}
              </div>
            </section>

            {canControlTake && take.status !== 'completed' && (
              <button
                onClick={async () => {
                  await fetch(`/api/audition-rooms/${roomCode}/participants/me`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      recording_state: uploadedSequenceIndexes.size >= assignedLines.length ? 'complete' : 'awaiting_uploads',
                      take_id: take.id,
                    }),
                  }).catch(() => undefined);
                  await fetch(`/api/auditions/takes/${take.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'completed' }),
                  });
                  router.push(`/pro/auditions/${take.audition_script_id}/scenes/${scene.id}`);
                }}
                className="rounded-xl border border-gold/40 px-4 py-3 text-sm text-gold hover:bg-gold/10"
              >
                End rehearsal
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30 text-center text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="px-4 pt-3 pb-8 border-t border-border bg-surface flex items-center justify-center gap-4 flex-shrink-0" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px) + 1rem)' }}>
        {recState === 'idle' && (
          <button
            onClick={() => stream && startRecording(stream)}
            disabled={!hasPermission || !currentLine}
            className="px-8 py-3 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Record line
          </button>
        )}

        {recState === 'recording' && (
          <button
            onClick={stopRecording}
            className="px-8 py-3 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 transition-colors animate-pulse"
          >
            Stop
          </button>
        )}

        {recState === 'recorded' && (
          <>
            <button
              onClick={reset}
              className="px-5 py-3 border border-border rounded-full text-sm text-muted hover:text-foreground"
            >
              Retake
            </button>
            <button
              onClick={uploadClip}
              disabled={uploading}
              className="px-8 py-3 bg-gold text-black rounded-full font-medium hover:bg-gold-dim disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Save clip'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

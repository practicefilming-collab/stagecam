'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMediaDevices } from '@/hooks/use-media-devices';
import { useRecording } from '@/hooks/use-recording';
import { STORAGE_BUCKETS } from '@/lib/constants';
import type { Chunk, AssignedChunk, Room, Script } from '@/lib/types';

export default function RehearsePage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const router = useRouter();
  const supabase = createClient();

  const { stream, error: mediaError, hasPermission, videoRef, requestPermission } = useMediaDevices();
  const { state: recState, blob, previewUrl, duration, mimeType, startRecording, stopRecording, reset } = useRecording();

  const [room, setRoom] = useState<Room | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [assignedChunks, setAssignedChunks] = useState<AssignedChunk[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const playbackRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single();

      if (!roomData || roomData.status !== 'active') {
        router.push(`/stage/${roomCode}`);
        return;
      }
      setRoom(roomData);

      const { data: scriptData } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', roomData.script_id)
        .single();
      setScript(scriptData);

      // Get participant assignment
      const { data: participant } = await supabase
        .from('room_participants')
        .select('assigned_chunks')
        .eq('room_id', roomData.id)
        .eq('user_id', user.id)
        .single();

      const assigned = (participant?.assigned_chunks ?? []) as AssignedChunk[];
      setAssignedChunks(assigned);

      // Load chunk details
      if (assigned.length > 0) {
        const chunkIds = assigned.map((a) => a.chunk_id);
        const { data: chunkData } = await supabase
          .from('chunks')
          .select('*')
          .in('id', chunkIds)
          .order('chunk_index');
        setChunks(chunkData ?? []);
      }

      setLoading(false);
    }
    load();
  }, [roomCode]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, []);

  const currentChunk = chunks[currentChunkIdx] ?? null;
  const currentAssignment = assignedChunks.find(
    (a) => a.chunk_id === currentChunk?.id
  );

  const uploadRecording = useCallback(async () => {
    if (!blob || !currentChunk || !room) return;
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const contentType = mimeType.includes('mp4') ? 'video/mp4' : 'video/webm';
    const timestamp = Date.now();
    const path = `${room.script_id}/${currentChunk.id}/${user.id}_${timestamp}.${ext}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKETS.RECORDINGS)
      .upload(path, blob, { contentType });

    if (uploadError) {
      console.error('Upload failed:', uploadError);
      setUploading(false);
      return;
    }

    // Create recording record
    await supabase.from('recordings').insert({
      chunk_id: currentChunk.id,
      user_id: user.id,
      room_id: room.id,
      video_url: path,
      duration_seconds: duration,
      format: ext,
    });

    // Move to next chunk or finish
    if (currentChunkIdx < chunks.length - 1) {
      setCurrentChunkIdx((prev) => prev + 1);
      reset();
    } else {
      router.push(`/stage/${roomCode}/complete`);
    }
    setUploading(false);
  }, [blob, currentChunk, room, duration, mimeType, currentChunkIdx, chunks.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading rehearsal...</p>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center px-4">
        <p className="text-muted text-lg mb-4">No chunks assigned to you for this session.</p>
        <button
          onClick={() => router.push('/menu')}
          className="px-6 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-hover"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  const isRecorded = recState === 'recorded';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background" style={{ paddingTop: '3.5rem' }}>
      {/* Progress bar */}
      <div className="h-1 bg-border flex-shrink-0">
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${((currentChunkIdx + 1) / chunks.length) * 100}%` }}
        />
      </div>

      {/* Header info */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <span className="text-sm text-muted">
            {script?.title} - Chunk {currentChunkIdx + 1}/{chunks.length}
          </span>
          {currentAssignment?.character && (
            <span className="ml-3 px-2 py-0.5 bg-gold/10 text-gold text-xs rounded-full">
              {currentAssignment.character}
            </span>
          )}
        </div>
        <span className="text-xs text-muted uppercase">
          {currentChunk?.type}
        </span>
      </div>

      {/* Split screen */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Webcam / Playback */}
        <div className="relative bg-black flex-shrink-0 overflow-hidden" style={{ height: '30vh' }}>
          {/* Live camera feed — always mounted, hidden during playback */}
          <video
            key="live-camera"
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ display: isRecorded ? 'none' : 'block' }}
            className="absolute inset-0 w-full h-full object-contain"
          />

          {/* Playback preview — shown after recording */}
          {isRecorded && previewUrl && (
            <video
              key="playback"
              ref={playbackRef}
              src={previewUrl}
              controls
              playsInline
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}

          {/* Camera error */}
          {mediaError && !isRecorded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-4">
                <p className="text-red-400 text-sm mb-3">{mediaError}</p>
                <button
                  onClick={requestPermission}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-sm"
                >
                  Allow Camera
                </button>
              </div>
            </div>
          )}

          {/* Recording indicator */}
          {recState === 'recording' && (
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full z-10">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-mono">REC</span>
            </div>
          )}

          {/* Recorded badge */}
          {isRecorded && (
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full z-10">
              <span className="text-green-400 text-xs">Recorded ({duration}s) — tap to play</span>
            </div>
          )}
        </div>

        {/* Script text */}
        <div className="flex-1 min-h-0 bg-surface p-4 lg:p-6 overflow-y-auto">
          {currentChunk?.type === 'scene_heading' && (
            <div className="text-gold text-xs uppercase tracking-wider mb-3">
              Scene Heading
            </div>
          )}
          {currentAssignment?.character && (
            <div className="text-gold font-semibold mb-2">
              {currentAssignment.character}
            </div>
          )}
          <p className="text-base lg:text-lg leading-relaxed whitespace-pre-wrap">
            {currentChunk?.tts_text ?? currentChunk?.chunk_text}
          </p>
        </div>
      </div>

      {/* Controls — extra bottom padding to clear Safari URL bar */}
      <div className="px-4 pt-3 pb-8 border-t border-border bg-surface flex items-center justify-center gap-4 flex-shrink-0" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px) + 1rem)' }}>
        {recState === 'idle' && (
          <button
            onClick={() => stream && startRecording(stream)}
            disabled={!hasPermission}
            className="px-8 py-3 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Record
          </button>
        )}

        {recState === 'recording' && (
          <button
            onClick={stopRecording}
            className="px-8 py-3 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 transition-colors animate-pulse"
          >
            Stop Recording
          </button>
        )}

        {recState === 'recorded' && (
          <>
            <button
              onClick={reset}
              className="px-6 py-3 bg-surface border border-border rounded-full font-medium hover:bg-surface-hover transition-colors"
            >
              Re-record
            </button>
            <button
              onClick={uploadRecording}
              disabled={uploading}
              className="px-8 py-3 bg-gold text-black rounded-full font-semibold hover:bg-gold-dim transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : currentChunkIdx < chunks.length - 1 ? 'Upload & Next' : 'Upload & Finish'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

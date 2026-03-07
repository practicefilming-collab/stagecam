'use client';

import { useRef, useState, useCallback } from 'react';
import { MAX_RECORDING_DURATION_MS, VIDEO_CONSTRAINTS } from '@/lib/constants';

export type RecordingState = 'idle' | 'recording' | 'recorded' | 'uploading';

export function useRecording() {
  const [state, setState] = useState<RecordingState>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startRecording = useCallback(async (stream: MediaStream) => {
    chunksRef.current = [];
    setBlob(null);
    setDuration(0);

    const mimeType = MediaRecorder.isTypeSupported(VIDEO_CONSTRAINTS.mimeType)
      ? VIDEO_CONSTRAINTS.mimeType
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_CONSTRAINTS.videoBitsPerSecond,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const recordedBlob = new Blob(chunksRef.current, { type: mimeType });
      setBlob(recordedBlob);
      setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
      setState('recorded');
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    mediaRecorderRef.current = recorder;
    startTimeRef.current = Date.now();
    recorder.start(1000); // collect data every second
    setState('recording');

    // Auto-stop at max duration
    timerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, MAX_RECORDING_DURATION_MS);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setDuration(0);
    setState('idle');
    chunksRef.current = [];
  }, []);

  return {
    state,
    setState,
    blob,
    duration,
    startRecording,
    stopRecording,
    reset,
  };
}

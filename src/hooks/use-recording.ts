'use client';

import { useRef, useState, useCallback } from 'react';
import { MAX_RECORDING_DURATION_MS } from '@/lib/constants';

export type RecordingState = 'idle' | 'recording' | 'recorded' | 'uploading';

function getSupportedMimeType(): string {
  // iOS Safari supports mp4, not webm
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [mimeType, setMimeType] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startRecording = useCallback(async (stream: MediaStream) => {
    chunksRef.current = [];
    setBlob(null);
    setDuration(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    const type = getSupportedMimeType();
    setMimeType(type);

    const options: MediaRecorderOptions = {};
    if (type) {
      options.mimeType = type;
    }
    // Only set bitrate for webm (mp4 on iOS doesn't reliably support it)
    if (type.includes('webm')) {
      options.videoBitsPerSecond = 2_500_000;
    }

    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const recordedBlob = new Blob(chunksRef.current, { type: type || 'video/webm' });
      setBlob(recordedBlob);
      setPreviewUrl(URL.createObjectURL(recordedBlob));
      setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
      setState('recorded');
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    mediaRecorderRef.current = recorder;
    startTimeRef.current = Date.now();
    // No timeslice arg — iOS Safari doesn't support start(timeslice) reliably
    recorder.start();
    setState('recording');

    timerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, MAX_RECORDING_DURATION_MS);
  }, [previewUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setDuration(0);
    setState('idle');
    chunksRef.current = [];
  }, [previewUrl]);

  return {
    state,
    setState,
    blob,
    previewUrl,
    duration,
    mimeType,
    startRecording,
    stopRecording,
    reset,
  };
}

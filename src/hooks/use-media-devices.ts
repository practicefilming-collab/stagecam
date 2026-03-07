'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const attachStream = useCallback((mediaStream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.setAttribute('playsinline', '');
      videoRef.current.setAttribute('webkit-playsinline', '');
      videoRef.current.muted = true;
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(() => {
        // Autoplay may fail silently on some browsers
      });
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: true,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setHasPermission(true);
      setError(null);
      attachStream(mediaStream);
    } catch {
      setError('Camera/microphone access denied. Please allow access to record.');
      setHasPermission(false);
    }
  }, [attachStream]);

  // Re-attach stream when videoRef mounts (handles late attachment)
  useEffect(() => {
    const el = videoRef.current;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      attachStream(streamRef.current);
    }
  }, [stream, attachStream]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { stream, error, hasPermission, videoRef, requestPermission, stopStream };
}

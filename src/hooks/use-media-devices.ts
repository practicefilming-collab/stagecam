'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const attachToElement = useCallback((el: HTMLVideoElement, mediaStream: MediaStream) => {
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.muted = true;
    el.srcObject = mediaStream;
    // Retry play — iOS Safari sometimes needs a moment
    const tryPlay = () => {
      el.play().catch(() => {
        setTimeout(tryPlay, 200);
      });
    };
    tryPlay();
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

      // Attach immediately if element exists
      if (videoElRef.current) {
        attachToElement(videoElRef.current, mediaStream);
      }
    } catch {
      setError('Camera/microphone access denied. Please allow access to record.');
      setHasPermission(false);
    }
  }, [attachToElement]);

  // Ref callback — fires when the <video> element mounts/unmounts
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && streamRef.current) {
      attachToElement(el, streamRef.current);
    }
  }, [attachToElement]);

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

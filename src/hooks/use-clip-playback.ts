'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseClipPlaybackOptions {
  audioUrl: string | null;
  speedValue: number;
  pitchTreatment: 'pitch_shifted' | 'pitch_preserved';
}

interface UseClipPlaybackReturn {
  play: () => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  currentTimeMs: number;
  analyserNode: AnalyserNode | null;
  duration: number;
}

/**
 * Web Audio API hook for clip playback with real-time speed and pitch control.
 *
 * - Speed: controlled via AudioBufferSourceNode.playbackRate
 * - Pitch preservation: compensated via detune (cents = -1200 * log2(speed))
 * - Exposes AnalyserNode for the visualization canvas
 * - Tracks currentTimeMs for subtitle sync
 */
export function useClipPlayback({
  audioUrl,
  speedValue,
  pitchTreatment,
}: UseClipPlaybackOptions): UseClipPlaybackReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [duration, setDuration] = useState(0);

  // Store current speed/pitch in refs so the RAF loop uses latest values
  const speedRef = useRef(speedValue);
  const pitchRef = useRef(pitchTreatment);
  useEffect(() => { speedRef.current = speedValue; }, [speedValue]);
  useEffect(() => { pitchRef.current = pitchTreatment; }, [pitchTreatment]);

  // Load audio buffer
  const loadAudio = useCallback(async () => {
    if (!audioUrl || audioBufferRef.current) return;

    setIsLoading(true);
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration * 1000);

      // Create analyser once
      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        setAnalyserNode(analyser);
      }
    } catch (err) {
      console.error('Failed to load audio:', err);
    } finally {
      setIsLoading(false);
    }
  }, [audioUrl]);

  // Time tracking loop
  const startTimeTracking = useCallback(() => {
    const tick = () => {
      const ctx = audioContextRef.current;
      if (!ctx || !isPlaying) return;

      const elapsed = ctx.currentTime - startTimeRef.current;
      // currentTimeMs tracks the position in the original audio
      // playbackRate handles the actual speed, so elapsed * speed = original position
      const posMs = elapsed * speedRef.current * 1000;
      setCurrentTimeMs(posMs);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [isPlaying]);

  const play = useCallback(async () => {
    if (isPlaying) return;

    await loadAudio();

    const ctx = audioContextRef.current;
    const buffer = audioBufferRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !buffer || !analyser) return;

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Create fresh source node (they're one-shot)
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speedRef.current;

    // Pitch compensation for pitch_preserved mode
    if (pitchRef.current === 'pitch_preserved' && speedRef.current !== 1.0) {
      // detune in cents to counteract the pitch change from speed adjustment
      // At speed 0.6, pitch drops by 1200 * log2(0.6) ≈ -737 cents
      // We add +737 to compensate
      source.detune.value = -1200 * Math.log2(speedRef.current);
    } else {
      source.detune.value = 0;
    }

    source.connect(analyser);
    analyser.connect(ctx.destination);

    source.onended = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };

    sourceNodeRef.current = source;
    startTimeRef.current = ctx.currentTime;

    source.start(0);
    setIsPlaying(true);
    setCurrentTimeMs(0);
  }, [isPlaying, loadAudio]);

  // Start time tracking when playing
  useEffect(() => {
    if (isPlaying) {
      startTimeTracking();
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, startTimeTracking]);

  // Update speed/pitch on running source node
  useEffect(() => {
    const source = sourceNodeRef.current;
    if (!source || !isPlaying) return;

    source.playbackRate.value = speedValue;

    if (pitchTreatment === 'pitch_preserved' && speedValue !== 1.0) {
      source.detune.value = -1200 * Math.log2(speedValue);
    } else {
      source.detune.value = 0;
    }
  }, [speedValue, pitchTreatment, isPlaying]);

  const stop = useCallback(() => {
    const source = sourceNodeRef.current;
    if (source) {
      try { source.stop(); } catch { /* already stopped */ }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close().catch(() => {});
      }
    };
  }, [stop]);

  return {
    play,
    stop,
    isPlaying,
    isLoading,
    currentTimeMs,
    analyserNode,
    duration,
  };
}

'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { ClipVisualizationConfig, ClipEnergyLevel, ClipVizPreset } from '@/lib/types';

interface BeatMap {
  bpm: number;
  beat_times_ms: number[];
  beat_strengths: number[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface CanvasRendererProps {
  vizConfig: ClipVisualizationConfig;
  energyLevel: ClipEnergyLevel;
  displayTitle: string;
  audioAnalyser: AnalyserNode | null;
  beatMap: BeatMap | null;
  currentTimeMs: number;
  isPlaying: boolean;
}

// Preset config table
const PRESET_CONFIG: Record<ClipVizPreset, {
  showRing: boolean;
  ringStyle: 'full' | 'thin' | 'glow' | 'none';
  particleLevel: 'none' | 'minimal' | 'medium' | 'heavy';
  avatarStyle: 'image' | 'silhouette' | 'initials';
  pulseStrength: number; // scale factor
  bounceOnBeat: boolean;
}> = {
  waveform_pulse:    { showRing: true,  ringStyle: 'full', particleLevel: 'minimal', avatarStyle: 'image',      pulseStrength: 0.03, bounceOnBeat: false },
  particle_burst:    { showRing: true,  ringStyle: 'thin', particleLevel: 'heavy',   avatarStyle: 'image',      pulseStrength: 0.06, bounceOnBeat: false },
  glow_ring:         { showRing: true,  ringStyle: 'glow', particleLevel: 'minimal', avatarStyle: 'silhouette', pulseStrength: 0.03, bounceOnBeat: false },
  silhouette_bounce: { showRing: false, ringStyle: 'none', particleLevel: 'medium',  avatarStyle: 'silhouette', pulseStrength: 0,    bounceOnBeat: true },
  minimal_text:      { showRing: false, ringStyle: 'none', particleLevel: 'none',    avatarStyle: 'initials',   pulseStrength: 0,    bounceOnBeat: false },
};

// Energy level → particle density multiplier
const ENERGY_MULTIPLIER: Record<ClipEnergyLevel, number> = {
  low: 0.3,
  medium: 0.6,
  high: 1.0,
  explosive: 1.8,
};

// Particle count per beat by particle level
const PARTICLE_COUNTS: Record<string, number> = {
  none: 0,
  minimal: 3,
  medium: 8,
  heavy: 16,
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function CanvasRenderer({
  vizConfig,
  energyLevel,
  displayTitle,
  audioAnalyser,
  beatMap,
  currentTimeMs,
  isPlaying,
}: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastBeatIndexRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const preset = PRESET_CONFIG[vizConfig.style_preset] ?? PRESET_CONFIG.waveform_pulse;
  const colors = vizConfig.color_palette;
  const reactivity = vizConfig.beat_reactivity_intensity;

  // Load avatar image
  useEffect(() => {
    if (vizConfig.creator_avatar_path && preset.avatarStyle !== 'initials') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = vizConfig.creator_avatar_path;
      img.onload = () => { avatarImgRef.current = img; };
    } else {
      avatarImgRef.current = null;
    }
  }, [vizConfig.creator_avatar_path, preset.avatarStyle]);

  // Allocate analyser buffer
  useEffect(() => {
    if (audioAnalyser) {
      analyserDataRef.current = new Uint8Array(audioAnalyser.fftSize) as Uint8Array<ArrayBuffer>;
    }
  }, [audioAnalyser]);

  // Spawn particles on beat hits
  useEffect(() => {
    if (!beatMap || !isPlaying || preset.particleLevel === 'none') return;

    const beats = beatMap.beat_times_ms;
    let newIndex = lastBeatIndexRef.current;

    while (newIndex < beats.length && beats[newIndex] <= currentTimeMs) {
      newIndex++;
    }

    // Spawn particles for any new beats crossed
    if (newIndex > lastBeatIndexRef.current) {
      const count = Math.round(
        PARTICLE_COUNTS[preset.particleLevel] *
        ENERGY_MULTIPLIER[energyLevel] *
        reactivity,
      );

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (1 + Math.random() * 2) * (energyLevel === 'explosive' ? 2 : 1);
        particlesRef.current.push({
          x: 0,
          y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 1.5 + Math.random() * 0.5,
          size: 2 + Math.random() * 3,
        });
      }
    }

    lastBeatIndexRef.current = newIndex;
  }, [currentTimeMs, beatMap, isPlaying, preset.particleLevel, energyLevel, reactivity]);

  // Reset beat index when seeking
  useEffect(() => {
    if (beatMap && currentTimeMs < (lastTimeRef.current - 500)) {
      // Seeked backward — find correct beat index
      let idx = 0;
      while (idx < beatMap.beat_times_ms.length && beatMap.beat_times_ms[idx] <= currentTimeMs) {
        idx++;
      }
      lastBeatIndexRef.current = idx;
    }
    lastTimeRef.current = currentTimeMs;
  }, [currentTimeMs, beatMap]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const minDim = Math.min(w, h);

    // --- Background gradient ---
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.7);
    bg.addColorStop(0, colors.secondary);
    bg.addColorStop(1, '#050505');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (vizConfig.style_preset === 'minimal_text') {
      // Minimal: just initials
      ctx.fillStyle = colors.primary;
      ctx.font = `bold ${minDim * 0.15}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initials = displayTitle.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      ctx.fillText(initials, cx, cy);
      return;
    }

    // --- Particles ---
    const particles = particlesRef.current;
    const dt = 1 / 60;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life += dt;

      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = 1 - p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(colors.accent, alpha * 0.8);
      ctx.fill();
    }

    // --- Waveform Ring ---
    if (preset.showRing && audioAnalyser && analyserDataRef.current) {
      audioAnalyser.getByteTimeDomainData(analyserDataRef.current);
      const data = analyserDataRef.current;
      const baseRadius = minDim * 0.25;
      const maxRadius = minDim * 0.4;
      const sliceAngle = (Math.PI * 2) / data.length;

      const ringWidth = preset.ringStyle === 'thin' ? 1.5 :
                        preset.ringStyle === 'glow' ? 4 : 2;

      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0; // normalize 0-2
        const r = baseRadius + (v - 1) * (maxRadius - baseRadius) * 2;
        const angle = sliceAngle * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = ringWidth;

      if (preset.ringStyle === 'glow') {
        ctx.shadowColor = colors.primary;
        ctx.shadowBlur = 15;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // --- Avatar ---
    const avatarRadius = minDim * 0.12;

    // Calculate beat pulse
    let pulseScale = 1;
    let bounceY = 0;
    if (beatMap && isPlaying) {
      const beats = beatMap.beat_times_ms;
      // Find closest recent beat
      let closestBeatDist = Infinity;
      for (let i = Math.max(0, lastBeatIndexRef.current - 2); i <= lastBeatIndexRef.current; i++) {
        if (i < beats.length) {
          const dist = Math.abs(currentTimeMs - beats[i]);
          if (dist < closestBeatDist) closestBeatDist = dist;
        }
      }

      // Pulse decays over 150ms from beat
      if (closestBeatDist < 150) {
        const t = closestBeatDist / 150;
        const eased = 1 - t * t; // quadratic ease out
        if (preset.bounceOnBeat) {
          bounceY = -eased * minDim * 0.03;
        } else {
          pulseScale = 1 + eased * preset.pulseStrength;
        }
      }
    }

    const avatarY = cy + bounceY;

    ctx.save();
    ctx.translate(cx, avatarY);
    ctx.scale(pulseScale, pulseScale);

    // Clip to circle
    ctx.beginPath();
    ctx.arc(0, 0, avatarRadius, 0, Math.PI * 2);
    ctx.clip();

    if (avatarImgRef.current && preset.avatarStyle !== 'initials') {
      // Draw image
      const img = avatarImgRef.current;
      const size = avatarRadius * 2;
      ctx.drawImage(img, -avatarRadius, -avatarRadius, size, size);

      // Silhouette overlay for silhouette presets
      if (preset.avatarStyle === 'silhouette') {
        ctx.fillStyle = hexToRgba(colors.secondary, 0.6);
        ctx.fillRect(-avatarRadius, -avatarRadius, size, size);
      }
    } else {
      // Initials fallback
      ctx.fillStyle = hexToRgba(colors.primary, 0.15);
      ctx.fillRect(-avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.fillStyle = colors.primary;
      ctx.font = `bold ${avatarRadius * 0.8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initials = displayTitle.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      ctx.fillText(initials, 0, 0);
    }

    ctx.restore();

    // Avatar border
    ctx.beginPath();
    ctx.arc(cx, avatarY, avatarRadius * pulseScale, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(colors.primary, 0.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [vizConfig, colors, preset, displayTitle, audioAnalyser, beatMap, currentTimeMs, isPlaying, energyLevel, reactivity]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Match canvas resolution to display size
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();

    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  );
}

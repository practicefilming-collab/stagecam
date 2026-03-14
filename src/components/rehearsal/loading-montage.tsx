'use client';

import { useEffect, useRef, useState } from 'react';
import { getLineText } from '@/lib/line-helpers';
import type { Line, AssignedLine } from '@/lib/types';

interface LoadingMontageProps {
  lines: Line[];
  assignedLines: AssignedLine[];
  scriptTitle: string;
  visible: boolean;
  onExited: () => void;
}

export function LoadingMontage({
  lines,
  assignedLines,
  scriptTitle,
  visible,
  onExited,
}: LoadingMontageProps) {
  const [lineIdx, setLineIdx] = useState(0);
  const [linePhase, setLinePhase] = useState<'enter' | 'visible' | 'exit'>('enter');
  const [overlayFade, setOverlayFade] = useState(true); // true = visible
  const [linesShown, setLinesShown] = useState(0);
  const [ready, setReady] = useState(false);
  const [finalized, setFinalized] = useState(false);

  const holdStartRef = useRef<number | null>(null);
  const holdRafRef = useRef<number>(0);
  const fillRef = useRef<HTMLDivElement>(null);

  // Kick initial line into visible phase
  useEffect(() => {
    const t = setTimeout(() => setLinePhase('visible'), 50);
    return () => clearTimeout(t);
  }, []);

  // Cycle through lines
  useEffect(() => {
    if (lines.length <= 1) return;
    const interval = setInterval(() => {
      setLinePhase('exit');
      setTimeout(() => {
        setLineIdx((i) => (i + 1) % lines.length);
        setLinesShown((n) => n + 1);
        setLinePhase('enter');
        setTimeout(() => setLinePhase('visible'), 50);
      }, 400);
    }, 2800);
    return () => clearInterval(interval);
  }, [lines.length]);

  // Intercept visible=false as "rehearsal is ready"
  useEffect(() => {
    if (!visible) setReady(true);
  }, [visible]);

  // Auto-finalize when ready AND one full cycle complete
  useEffect(() => {
    if (ready && (lines.length <= 1 || linesShown >= lines.length - 1)) {
      setFinalized(true);
    }
  }, [ready, linesShown, lines.length]);

  // When finalized, ensure fill bar transitions to 100%
  useEffect(() => {
    if (finalized && fillRef.current) {
      fillRef.current.style.transition = 'width 500ms ease-out';
      fillRef.current.style.width = '100%';
    }
  }, [finalized]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(holdRafRef.current);
  }, []);

  const handleHoldStart = () => {
    if (finalized) return;
    holdStartRef.current = Date.now();
    if (fillRef.current) fillRef.current.style.transition = 'none';
    const animate = () => {
      if (!holdStartRef.current || !fillRef.current) return;
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(elapsed / 5000, 1);
      fillRef.current.style.width = `${progress * 100}%`;
      if (progress >= 1) {
        setFinalized(true);
        holdStartRef.current = null;
        return;
      }
      holdRafRef.current = requestAnimationFrame(animate);
    };
    holdRafRef.current = requestAnimationFrame(animate);
  };

  const handleHoldEnd = () => {
    if (finalized) return;
    holdStartRef.current = null;
    cancelAnimationFrame(holdRafRef.current);
    if (fillRef.current) {
      fillRef.current.style.transition = 'width 300ms ease-out';
      fillRef.current.style.width = '0%';
    }
  };

  const handleStart = () => setOverlayFade(false);

  const handleTransitionEnd = () => {
    if (!overlayFade) {
      onExited();
    }
  };

  const line = lines[lineIdx] ?? null;
  const assignment = line
    ? assignedLines.find((a) => a.line_id === line.id)
    : null;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: '#0a0a0a',
        opacity: overlayFade ? 1 : 0,
        transition: 'opacity 600ms ease-out',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="spotlight absolute inset-0 flex flex-col items-center justify-between py-16 px-6">
        {/* Script title */}
        <h1 className="text-gold-glow text-sm uppercase tracking-[0.2em] font-semibold text-center">
          {scriptTitle}
        </h1>

        {/* Line display */}
        <div
          className="max-w-sm text-center"
          style={
            linePhase === 'enter'
              ? { opacity: 0, transform: 'scale(0.96) translateY(8px)', transition: 'none' }
              : linePhase === 'visible'
                ? { opacity: 1, transform: 'scale(1.02) translateY(-4px)', transition: 'opacity 400ms ease-out, transform 2400ms ease-out' }
                : { opacity: 0, transform: 'scale(1.04) translateY(-12px)', transition: 'opacity 400ms ease-out, transform 400ms ease-out' }
          }
        >
          {lines.length === 0 ? (
            <p className="text-muted text-sm animate-pulse">Preparing your stage…</p>
          ) : (
            <>
              {assignment?.character && (
                <p className="text-gold font-semibold mb-2">{assignment.character}</p>
              )}
              {line && (
                <p
                  className={`text-lg leading-relaxed ${
                    line.type === 'action'
                      ? 'italic text-muted'
                      : line.type === 'scene_heading'
                        ? 'uppercase text-gold/70 text-sm tracking-wider'
                        : ''
                  }`}
                >
                  {getLineText(line)}
                </p>
              )}
            </>
          )}
        </div>

        {/* Bottom: ghost/fill/finalized button or pulse text */}
        {lines.length > 0 ? (
          <button
            onPointerDown={handleHoldStart}
            onPointerUp={handleHoldEnd}
            onPointerLeave={handleHoldEnd}
            onPointerCancel={handleHoldEnd}
            onClick={finalized ? handleStart : undefined}
            className={`relative overflow-hidden w-full max-w-xs py-3 rounded-xl font-semibold text-lg
              transition-all duration-300
              ${finalized
                ? 'border-2 border-gold text-black cursor-pointer'
                : 'border-2 border-gold text-black cursor-default'
              }`}
            style={{ opacity: finalized ? 1 : 0.7 }}
          >
            {/* Gold fill bar */}
            <div
              ref={fillRef}
              className="absolute inset-y-0 left-0 bg-gold rounded-xl"
              style={{ width: finalized ? '100%' : '0%', transition: 'width 500ms ease-out' }}
            />
            <span className="relative z-10">Start Rehearsal</span>
          </button>
        ) : (
          <p className="text-muted text-sm animate-pulse">Preparing your stage…</p>
        )}
      </div>
    </div>
  );
}

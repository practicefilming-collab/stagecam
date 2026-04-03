'use client';

import type { ClipSubtitleData } from '@/lib/types';

interface KaraokeSubtitlesProps {
  subtitleData: ClipSubtitleData | null;
  currentTimeMs: number;
  speedFactor: number;
}

/**
 * Word-level karaoke subtitle renderer.
 * Highlights the current word in gold, past words dimmed, future words normal.
 * Timing is adjusted by the speed factor.
 */
export default function KaraokeSubtitles({
  subtitleData,
  currentTimeMs,
  speedFactor,
}: KaraokeSubtitlesProps) {
  if (!subtitleData || !subtitleData.cues || subtitleData.cues.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-muted text-xs">No subtitles available</p>
      </div>
    );
  }

  // Adjust all timing by speed factor
  // At 0.60x speed, a word at 1000ms in the original plays at ~1667ms
  const adjustMs = (ms: number) => Math.round(ms / speedFactor);

  // Find the active cue (the one currently being spoken)
  const activeCueIndex = subtitleData.cues.findIndex((cue) => {
    const start = adjustMs(cue.start_ms);
    const end = adjustMs(cue.end_ms);
    return currentTimeMs >= start && currentTimeMs < end;
  });

  // If no cue is active, find the next upcoming one
  const nextCueIndex = activeCueIndex === -1
    ? subtitleData.cues.findIndex((cue) => adjustMs(cue.start_ms) > currentTimeMs)
    : -1;

  // Show active cue, or the next upcoming cue dimmed, or the last cue if past everything
  const displayCueIndex = activeCueIndex !== -1
    ? activeCueIndex
    : nextCueIndex !== -1
      ? nextCueIndex
      : subtitleData.cues.length - 1;

  const displayCue = subtitleData.cues[displayCueIndex];
  const isActiveCue = activeCueIndex !== -1;

  // If the cue has word-level timing, render word by word
  if (displayCue.words && displayCue.words.length > 0) {
    return (
      <div className="text-center py-3 px-2">
        <p className="text-sm leading-relaxed">
          {displayCue.words.map((word, i) => {
            const wordStart = adjustMs(word.start_ms);
            const wordEnd = adjustMs(word.end_ms);

            let className = 'text-foreground/40'; // future: dimmed
            if (isActiveCue) {
              if (currentTimeMs >= wordStart && currentTimeMs < wordEnd) {
                className = 'text-gold font-semibold'; // current: gold
              } else if (currentTimeMs >= wordEnd) {
                className = 'text-foreground/60'; // past: slightly dimmed
              }
            } else {
              className = 'text-foreground/30'; // not active cue: very dimmed
            }

            return (
              <span key={i} className={`${className} transition-colors duration-100`}>
                {word.word}{' '}
              </span>
            );
          })}
        </p>

        {/* Show cue index indicator */}
        {subtitleData.cues.length > 1 && (
          <div className="flex justify-center gap-1 mt-2">
            {subtitleData.cues.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i === displayCueIndex ? 'bg-gold' : i < displayCueIndex ? 'bg-foreground/20' : 'bg-foreground/10'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback: no word-level timing, just show cue text
  return (
    <div className="text-center py-3 px-2">
      <p className={`text-sm leading-relaxed ${isActiveCue ? 'text-foreground' : 'text-foreground/40'}`}>
        {displayCue.text}
      </p>
    </div>
  );
}

import type { ClipSubtitleData } from '@/lib/types';

interface SpeechSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  words: { word: string; start_ms: number; end_ms: number; confidence: number }[];
}

/**
 * Convert speech segmentation output into the structured subtitle format
 * used by clip_segments.subtitle_data.
 */
export function speechToSubtitles(segments: SpeechSegment[]): ClipSubtitleData {
  const cues = segments.map((seg, i) => ({
    cue_id: i + 1,
    start_ms: seg.start_ms,
    end_ms: seg.end_ms,
    text: seg.text,
    words: seg.words.map((w) => ({
      word: w.word,
      start_ms: w.start_ms,
      end_ms: w.end_ms,
      confidence: w.confidence,
    })),
  }));

  return { cues };
}

/**
 * Adjust subtitle timing for a given speed factor.
 * At 0.60x, a cue starting at 1000ms should display at ~1667ms.
 */
export function adjustSubtitleTiming(data: ClipSubtitleData, speedFactor: number): ClipSubtitleData {
  return {
    cues: data.cues.map((cue) => ({
      ...cue,
      start_ms: Math.round(cue.start_ms / speedFactor),
      end_ms: Math.round(cue.end_ms / speedFactor),
      words: cue.words.map((w) => ({
        ...w,
        start_ms: Math.round(w.start_ms / speedFactor),
        end_ms: Math.round(w.end_ms / speedFactor),
      })),
    })),
  };
}

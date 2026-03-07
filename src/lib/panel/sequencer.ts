import type { Recording } from '../types';

interface SequenceItem {
  recording: Recording;
  startOffset: number;
}

export function buildPlaybackSequence(
  recordings: Recording[]
): SequenceItem[] {
  const sorted = [...recordings].sort((a, b) => {
    // Sort by chunk_id to maintain order (assumes chunk_id correlates with order)
    return a.chunk_id.localeCompare(b.chunk_id);
  });

  let offset = 0;
  return sorted.map((recording) => {
    const item: SequenceItem = {
      recording,
      startOffset: offset,
    };
    offset += recording.duration_seconds ?? 0;
    return item;
  });
}

export function getTotalDuration(recordings: Recording[]): number {
  return recordings.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);
}

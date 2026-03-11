import type { Recording, Line } from '../types';

interface MatchedSegment {
  line: Line;
  recording: Recording | null;
  performer: string | null;
}

export function matchRecordingsToLines(
  lines: Line[],
  recordings: Recording[]
): MatchedSegment[] {
  // Create a map of recorded line id -> latest recording.
  const recordingMap = new Map<string, Recording>();
  for (const rec of recordings) {
    const existing = recordingMap.get(rec.chunk_id);
    if (!existing || new Date(rec.created_at) > new Date(existing.created_at)) {
      recordingMap.set(rec.chunk_id, rec);
    }
  }

  return lines.map((line) => ({
    line,
    recording: recordingMap.get(line.id) ?? null,
    performer: recordingMap.get(line.id)?.user_id ?? null,
  }));
}

import type { Recording, Chunk } from '../types';

interface MatchedSegment {
  chunk: Chunk;
  recording: Recording | null;
  performer: string | null;
}

export function matchRecordingsToChunks(
  chunks: Chunk[],
  recordings: Recording[]
): MatchedSegment[] {
  // Create a map of chunk_id -> latest recording
  const recordingMap = new Map<string, Recording>();
  for (const rec of recordings) {
    const existing = recordingMap.get(rec.chunk_id);
    if (!existing || new Date(rec.created_at) > new Date(existing.created_at)) {
      recordingMap.set(rec.chunk_id, rec);
    }
  }

  return chunks.map((chunk) => ({
    chunk,
    recording: recordingMap.get(chunk.id) ?? null,
    performer: recordingMap.get(chunk.id)?.user_id ?? null,
  }));
}

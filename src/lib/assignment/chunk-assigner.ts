import type { Chunk, AssignedChunk } from '../types';

interface ParticipantAssignment {
  userId: string;
  chunks: AssignedChunk[];
}

export function assignChunks(
  chunks: Chunk[],
  participantIds: string[]
): ParticipantAssignment[] {
  if (participantIds.length === 0 || chunks.length === 0) {
    return participantIds.map((id) => ({ userId: id, chunks: [] }));
  }

  const assignments: ParticipantAssignment[] = participantIds.map((id) => ({
    userId: id,
    chunks: [],
  }));

  // Check if script has character data
  const dialogueChunks = chunks.filter((c) => c.type === 'dialogue' && c.character);
  const hasCharacterData = dialogueChunks.length > 0;

  if (!hasCharacterData) {
    // No character data: prioritize middle/later chunks over scene beginnings.
    // Scene headings and early action chunks are fine as TTS.
    const prioritized = prioritizeChunks(chunks);
    prioritized.forEach((chunk, i) => {
      const assignee = assignments[i % participantIds.length];
      assignee.chunks.push({
        chunk_id: chunk.id,
        role: chunk.type as AssignedChunk['role'],
      });
    });
    return assignments;
  }

  // Extract unique characters, sorted by dialogue volume (most lines first)
  const characterCounts = new Map<string, number>();
  dialogueChunks.forEach((c) => {
    const char = c.character!;
    characterCounts.set(char, (characterCounts.get(char) ?? 0) + 1);
  });

  const sortedCharacters = [...characterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([char]) => char);

  // Assign characters to participants (1 character per person max)
  const characterToParticipant = new Map<string, number>();
  sortedCharacters.forEach((char, i) => {
    const participantIdx = i % participantIds.length;
    characterToParticipant.set(char, participantIdx);
  });

  // Assign dialogue chunks to their character's participant
  dialogueChunks.forEach((chunk) => {
    const participantIdx = characterToParticipant.get(chunk.character!)!;
    assignments[participantIdx].chunks.push({
      chunk_id: chunk.id,
      role: 'dialogue',
      character: chunk.character!,
    });
  });

  // Assign non-dialogue chunks, deprioritizing scene beginnings.
  // Scene headings and early action are assigned last (fine as TTS fallback).
  const nonDialogueChunks = chunks.filter(
    (c) => c.type !== 'dialogue' || !c.character
  );
  const prioritized = prioritizeChunks(nonDialogueChunks);

  prioritized.forEach((chunk) => {
    // Find participant with fewest total chunks
    const minIdx = assignments.reduce(
      (minI, curr, i) =>
        curr.chunks.length < assignments[minI].chunks.length ? i : minI,
      0
    );
    assignments[minIdx].chunks.push({
      chunk_id: chunk.id,
      role: chunk.type as AssignedChunk['role'],
    });
  });

  return assignments;
}

/**
 * Reorder chunks so scene beginnings (scene_heading, transitions, early
 * action blocks) come last. These are fine as TTS and don't need a
 * human performer as much as dialogue and mid-scene action.
 */
function prioritizeChunks(chunks: Chunk[]): Chunk[] {
  const priority = (c: Chunk): number => {
    // Dialogue always highest priority (assigned separately, but just in case)
    if (c.type === 'dialogue') return 0;
    // Mid-scene action is valuable to perform
    if (c.type === 'action' && c.chunk_in_scene > 3) return 1;
    // Early action (first 3 chunks of scene) — lower priority
    if (c.type === 'action') return 2;
    // Transitions — fine as TTS
    if (c.type === 'transition') return 3;
    // Scene headings — always fine as TTS
    if (c.type === 'scene_heading') return 4;
    return 2;
  };

  return [...chunks].sort((a, b) => priority(a) - priority(b));
}

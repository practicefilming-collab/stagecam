import type { Chunk, AssignedChunk } from '../types';
import { MAX_CHUNKS_PER_PERSON } from '../constants';

interface ParticipantAssignment {
  userId: string;
  chunks: AssignedChunk[];
  character: string | null;
}

export function assignChunks(
  chunks: Chunk[],
  participantIds: string[]
): ParticipantAssignment[] {
  if (participantIds.length === 0 || chunks.length === 0) {
    return participantIds.map((id) => ({ userId: id, chunks: [], character: null }));
  }

  const cap = MAX_CHUNKS_PER_PERSON;
  const assignments: ParticipantAssignment[] = participantIds.map((id) => ({
    userId: id,
    chunks: [],
    character: null,
  }));

  // ── Step 1: Character assignment (always first) ──
  const dialogueChunks = chunks.filter((c) => c.type === 'dialogue' && c.character);

  if (dialogueChunks.length > 0) {
    // Count dialogue lines per character, sorted by volume
    const characterCounts = new Map<string, number>();
    dialogueChunks.forEach((c) => {
      const char = c.character!;
      characterCounts.set(char, (characterCounts.get(char) ?? 0) + 1);
    });

    const sortedCharacters = [...characterCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([char]) => char);

    // 1 character per person, round-robin by dialogue volume
    const characterToParticipant = new Map<string, number>();
    sortedCharacters.forEach((char, i) => {
      if (i < participantIds.length) {
        characterToParticipant.set(char, i);
        assignments[i].character = char;
      }
    });

    // Assign dialogue chunks for assigned characters (up to cap)
    for (const chunk of dialogueChunks) {
      const participantIdx = characterToParticipant.get(chunk.character!);
      if (participantIdx === undefined) continue; // character not assigned to anyone
      if (assignments[participantIdx].chunks.length >= cap) continue; // at cap

      assignments[participantIdx].chunks.push({
        chunk_id: chunk.id,
        role: 'dialogue',
        character: chunk.character!,
      });
    }
  }

  // ── Step 2: Fill remaining capacity with non-dialogue chunks ──
  // Only if participants still have room under the cap.
  // Prioritize action over scene_heading/transition (those are fine as TTS).
  const nonDialogueChunks = chunks
    .filter((c) => c.type !== 'dialogue' || !c.character)
    .filter((c) => {
      // Skip scene_heading and transition — always leave as TTS
      if (c.type === 'scene_heading') return false;
      if (c.type === 'transition') return false;
      return true;
    });

  // Sort: mid-scene action first, early action last
  const sortedNonDialogue = [...nonDialogueChunks].sort((a, b) => {
    const scoreA = a.chunk_in_scene > 3 ? 0 : 1;
    const scoreB = b.chunk_in_scene > 3 ? 0 : 1;
    return scoreA - scoreB;
  });

  for (const chunk of sortedNonDialogue) {
    // Find participant with fewest chunks who is still under cap
    let minIdx = -1;
    let minCount = Infinity;
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i].chunks.length < cap && assignments[i].chunks.length < minCount) {
        minCount = assignments[i].chunks.length;
        minIdx = i;
      }
    }
    if (minIdx === -1) break; // everyone is at cap

    assignments[minIdx].chunks.push({
      chunk_id: chunk.id,
      role: chunk.type as AssignedChunk['role'],
    });
  }

  return assignments;
}

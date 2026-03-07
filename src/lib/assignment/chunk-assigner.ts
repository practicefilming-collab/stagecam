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
    // No character data: simple round-robin all chunks
    chunks.forEach((chunk, i) => {
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

  // Assign non-dialogue chunks round-robin, prioritizing those with fewer chunks
  const nonDialogueChunks = chunks.filter(
    (c) => c.type !== 'dialogue' || !c.character
  );

  nonDialogueChunks.forEach((chunk) => {
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

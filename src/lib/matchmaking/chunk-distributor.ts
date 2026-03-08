import type { Chunk, AssignedChunk } from '../types';
import type { ParticipantAssignment } from './types';
import { MAX_CHUNKS_PER_PERSON } from '../constants';

/**
 * Distributes chunks after character assignment.
 *
 * 1. Assign ALL dialogue chunks for each participant's character (no cap)
 * 2. Fill remaining capacity with action chunks (soft cap for non-dialogue filler)
 * 3. Distribute action to participant with fewest chunks
 */
export function distributeChunks(
  chunks: Chunk[],
  characterMap: Map<string, string>,
  participantIds: string[],
  participantNames: Map<string, string>
): ParticipantAssignment[] {
  if (participantIds.length === 0 || chunks.length === 0) {
    return participantIds.map((id) => ({
      userId: id,
      displayName: participantNames.get(id) ?? 'Unknown',
      character: characterMap.get(id) ?? null,
      chunks: [],
      dialogueCount: 0,
      actionCount: 0,
    }));
  }

  // Reverse map: characterName → userId
  const charToUser = new Map<string, string>();
  for (const [userId, charName] of characterMap) {
    charToUser.set(charName, userId);
  }

  // Initialize assignments
  const assignmentMap = new Map<string, AssignedChunk[]>();
  for (const id of participantIds) {
    assignmentMap.set(id, []);
  }

  // Step 1: Assign ALL dialogue chunks for assigned characters (no cap)
  const dialogueChunks = chunks.filter((c) => c.type === 'dialogue' && c.character);
  for (const chunk of dialogueChunks) {
    const userId = charToUser.get(chunk.character!);
    if (!userId) continue; // character not assigned to anyone (goes to TTS)
    assignmentMap.get(userId)!.push({
      chunk_id: chunk.id,
      role: 'dialogue',
      character: chunk.character!,
    });
  }

  // Step 2: Fill with action chunks (skip system chunks — those are always TTS)
  const actionChunks = chunks.filter((c) => {
    if (c.is_system) return false;
    if (c.type === 'dialogue' && c.character) return false; // already assigned above
    return true; // action chunks + unattributed dialogue
  });

  // Sort: mid-scene action first, early action last
  const sortedAction = [...actionChunks].sort((a, b) => {
    const scoreA = a.chunk_in_scene > 3 ? 0 : 1;
    const scoreB = b.chunk_in_scene > 3 ? 0 : 1;
    return scoreA - scoreB;
  });

  for (const chunk of sortedAction) {
    // Find participant with fewest chunks, respecting soft cap for non-dialogue
    let minIdx = -1;
    let minCount = Infinity;
    for (let i = 0; i < participantIds.length; i++) {
      if (characterMap.has(participantIds[i])) continue; // character users do dialogue only
      const userChunks = assignmentMap.get(participantIds[i])!;
      // Soft cap only applies to non-dialogue filler
      const actionCount = userChunks.filter((c) => c.role !== 'dialogue').length;
      if (actionCount < MAX_CHUNKS_PER_PERSON && userChunks.length < minCount) {
        minCount = userChunks.length;
        minIdx = i;
      }
    }
    if (minIdx === -1) break; // everyone at action cap

    assignmentMap.get(participantIds[minIdx])!.push({
      chunk_id: chunk.id,
      role: chunk.type as AssignedChunk['role'],
    });
  }

  // Build result
  return participantIds.map((id) => {
    const chunks = assignmentMap.get(id)!;
    return {
      userId: id,
      displayName: participantNames.get(id) ?? 'Unknown',
      character: characterMap.get(id) ?? null,
      chunks,
      dialogueCount: chunks.filter((c) => c.role === 'dialogue').length,
      actionCount: chunks.filter((c) => c.role !== 'dialogue').length,
    };
  });
}

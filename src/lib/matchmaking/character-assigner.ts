import type { CharacterProfile } from './types';

/**
 * Maps participants to characters. Biggest roles assigned first.
 * Extra characters go to TTS. Extra participants get action-only.
 *
 * @param characters Pre-sorted by dialogueChunkCount DESC
 * @param participantIds Ordered by join time
 * @returns Map<userId, characterName>
 */
export function assignCharacters(
  characters: CharacterProfile[],
  participantIds: string[]
): Map<string, string> {
  const characterMap = new Map<string, string>();

  // Assign one character per participant, biggest roles first
  const limit = Math.min(characters.length, participantIds.length);
  for (let i = 0; i < limit; i++) {
    characterMap.set(participantIds[i], characters[i].name);
  }

  return characterMap;
}

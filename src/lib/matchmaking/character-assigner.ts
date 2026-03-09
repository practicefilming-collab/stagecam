import type { CharacterProfile } from './types';

/**
 * Maps participants to characters. Biggest roles assigned first.
 * Extra characters go to TTS. Extra participants get action-only.
 *
 * When a roleDraft is provided, those assignments are used first.
 * Remaining unclaimed characters are auto-assigned to remaining participants.
 *
 * @param characters Pre-sorted by dialogueChunkCount DESC
 * @param participantIds Ordered by join time
 * @param roleDraft Optional user-selected role mappings (userId → character names)
 * @returns Map<userId, characterName>
 */
export function assignCharacters(
  characters: CharacterProfile[],
  participantIds: string[],
  roleDraft?: Record<string, string[]>
): Map<string, string> {
  const characterMap = new Map<string, string>();
  const characterNames = new Set(characters.map((c) => c.name));

  // Step 1: Apply role draft assignments
  if (roleDraft) {
    const claimedCharacters = new Set<string>();
    for (const [userId, charNames] of Object.entries(roleDraft)) {
      if (!participantIds.includes(userId)) continue;
      for (const name of charNames) {
        if (characterNames.has(name) && !claimedCharacters.has(name)) {
          characterMap.set(userId, name);
          claimedCharacters.add(name);
          break; // one character per user for now
        }
      }
    }
  }

  // Step 2: Auto-assign remaining unclaimed characters to unassigned participants
  const assignedUsers = new Set(characterMap.keys());
  const assignedChars = new Set(characterMap.values());
  const unassignedUsers = participantIds.filter((id) => !assignedUsers.has(id));
  const unclaimedChars = characters.filter((c) => !assignedChars.has(c.name));

  const limit = Math.min(unclaimedChars.length, unassignedUsers.length);
  for (let i = 0; i < limit; i++) {
    characterMap.set(unassignedUsers[i], unclaimedChars[i].name);
  }

  return characterMap;
}

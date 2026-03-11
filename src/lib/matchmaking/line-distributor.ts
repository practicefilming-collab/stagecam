import type { Line, AssignedLine } from '../types';
import type { ParticipantAssignment } from './types';
import { MAX_LINES_PER_PERSON } from '../constants';

/**
 * Distributes lines after character assignment.
 *
 * 1. Assign all dialogue lines for each participant's character.
 * 2. Fill remaining capacity with action lines.
 * 3. Distribute action to the participant with the fewest lines.
 */
export function distributeLines(
  lines: Line[],
  characterMap: Map<string, string>,
  participantIds: string[],
  participantNames: Map<string, string>
): ParticipantAssignment[] {
  if (participantIds.length === 0 || lines.length === 0) {
    return participantIds.map((id) => ({
      userId: id,
      displayName: participantNames.get(id) ?? 'Unknown',
      character: characterMap.get(id) ?? null,
      lines: [],
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
  const assignmentMap = new Map<string, AssignedLine[]>();
  for (const id of participantIds) {
    assignmentMap.set(id, []);
  }

  // Step 1: Assign all dialogue lines for assigned characters.
  const dialogueLines = lines.filter((line) => line.type === 'dialogue' && line.character);
  for (const line of dialogueLines) {
    const userId = charToUser.get(line.character!);
    if (!userId) continue; // character not assigned to anyone (goes to TTS)
    assignmentMap.get(userId)!.push({
      line_id: line.id,
      role: 'dialogue',
      character: line.character!,
    });
  }

  // Step 2: Fill with action lines (skip system lines — those are always TTS).
  const actionLines = lines.filter((line) => {
    if (line.is_system) return false;
    if (line.type === 'dialogue' && line.character) return false; // already assigned above
    return true; // action lines + unattributed dialogue
  });

  // Sort: mid-scene action first, early action last
  const sortedAction = [...actionLines].sort((a, b) => {
    const scoreA = a.chunk_in_scene > 3 ? 0 : 1;
    const scoreB = b.chunk_in_scene > 3 ? 0 : 1;
    return scoreA - scoreB;
  });

  for (const line of sortedAction) {
    // Find participant with fewest lines, respecting the soft filler cap.
    let minIdx = -1;
    let minCount = Infinity;
    for (let i = 0; i < participantIds.length; i++) {
      if (characterMap.has(participantIds[i])) continue; // character users do dialogue only
      const userLines = assignmentMap.get(participantIds[i])!;
      // Soft cap only applies to non-dialogue filler
      const actionCount = userLines.filter((assigned) => assigned.role !== 'dialogue').length;
      if (actionCount < MAX_LINES_PER_PERSON && userLines.length < minCount) {
        minCount = userLines.length;
        minIdx = i;
      }
    }
    if (minIdx === -1) break; // everyone at action cap

    assignmentMap.get(participantIds[minIdx])!.push({
      line_id: line.id,
      role: line.type as AssignedLine['role'],
    });
  }

  // Build result
  return participantIds.map((id) => {
    const assignedLines = assignmentMap.get(id)!;
    return {
      userId: id,
      displayName: participantNames.get(id) ?? 'Unknown',
      character: characterMap.get(id) ?? null,
      lines: assignedLines,
      dialogueCount: assignedLines.filter((line) => line.role === 'dialogue').length,
      actionCount: assignedLines.filter((line) => line.role !== 'dialogue').length,
    };
  });
}

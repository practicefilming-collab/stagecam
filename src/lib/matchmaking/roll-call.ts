import { MAX_LINES_PER_PERSON, MAX_PARTICIPANTS } from '../constants';
import type { RollCallEntry } from '../types';

/** Precompute role distribution for every valid participant count (1–N). */
export function computeRollCalls(characterCount: number, actionLineCount: number): RollCallEntry[] {
  const maxNarrators = actionLineCount > 0 ? actionLineCount : 0;
  const maxParticipants = Math.min(MAX_PARTICIPANTS, Math.max(1, characterCount + maxNarrators));
  const entries: RollCallEntry[] = [];

  for (let n = 1; n <= maxParticipants; n++) {
    const characters = Math.min(n, characterCount);
    const narrators = Math.max(0, n - characterCount);
    let actionsPerNarrator = 0;
    if (narrators > 0 && actionLineCount > 0) {
      actionsPerNarrator = Math.min(MAX_LINES_PER_PERSON, Math.floor(actionLineCount / narrators));
    }
    entries.push({ participants: n, characters, narrators, actionsPerNarrator });
  }

  return entries;
}

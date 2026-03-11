import { getMaxCharacterDialogueLines } from '../line-helpers';
import type { RollCallEntry } from '../types';
import type { ScoredScene } from './types';

/**
 * Selects the best scene for auto-mode matchmaking.
 *
 * Scoring formula:
 *   score = 4 * (1 - coverageRatio)        — coverage gap (heaviest weight)
 *         + 2 * characterFitScore           — 1 if chars ≤ participants
 *         + 1 * lineSizeScore               — 1 if biggest role ≤ 12 lines (soft preference)
 *         + 2 * completionBonus             — boost for 50-95% coverage (finish what you started)
 *
 * Sorts descending, picks from top 3 with random tiebreak.
 */
export function selectScene(
  scenes: ScoredScene[],
  participantCount: number
): ScoredScene | null {
  if (scenes.length === 0) return null;

  const scored = scenes.map((s) => {
    // Coverage gap — heaviest weight
    const coverageGap = 1 - s.coverageRatio;

    // Character fit: graduated score using roll calls, with binary fallback
    const characterFitScore = getCharacterFitScore(s, participantCount);

    // Line size score: soft preference for biggest role ≤ 12 lines
    const biggestRoleLines = getBiggestRoleLines(s);
    const lineSizeScore = biggestRoleLines <= 12 ? 1 : Math.max(0, 1 - (biggestRoleLines - 12) / 20);

    // Completion bonus: boost scenes at 50-95% coverage to encourage finishing
    let completionBonus = 0;
    if (s.coverageRatio >= 0.5 && s.coverageRatio < 0.95) {
      // Peak bonus at ~70-80% coverage
      completionBonus = Math.min(1, (s.coverageRatio - 0.5) / 0.3);
    }

    const score =
      4 * coverageGap +
      2 * characterFitScore +
      1 * lineSizeScore +
      2 * completionBonus;

    return { scene: s, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Pick from top 3 with random tiebreak
  const top = scored.slice(0, Math.min(3, scored.length));
  const idx = Math.floor(Math.random() * top.length);
  return top[idx].scene;
}

function getCharacterFitScore(s: ScoredScene, participantCount: number): number {
  const rollCalls = s.scene.roll_calls as RollCallEntry[] | undefined;
  if (!rollCalls || rollCalls.length === 0) {
    // Fallback: binary logic for scenes without roll_calls
    const charCount = s.characterCount;
    return charCount === 0 || charCount <= participantCount ? 1 : 0;
  }

  const entry = rollCalls.find((e) => e.participants === participantCount);
  if (!entry) return 0; // scene can't support this many participants

  if (entry.narrators === 0) return 1.0;
  if (entry.actionsPerNarrator >= 3) return 0.8;
  return 0.5;
}

function getBiggestRoleLines(s: ScoredScene): number {
  const maxDialogueLines = getMaxCharacterDialogueLines(s.scene.character_stats);
  if (maxDialogueLines > 0) {
    return maxDialogueLines;
  }
  // Fallback: estimate from dialogueLineCount / characterCount
  if (s.characterCount > 0) {
    return Math.ceil(s.dialogueLineCount / s.characterCount);
  }
  return 0;
}

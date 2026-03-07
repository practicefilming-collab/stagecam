import type { Scene } from '../types';
import { MAX_CHUNKS_PER_PERSON } from '../constants';

interface SceneCoverage {
  scene: Scene;
  coverageScore: number;
  recordingCount: number;
}

export function selectBestScene(
  scenes: Scene[],
  recordingCounts: Map<string, number>,
  participantCount: number
): Scene | null {
  if (scenes.length === 0) return null;

  const scored: SceneCoverage[] = scenes.map((scene) => {
    const count = recordingCounts.get(scene.id) ?? 0;
    return {
      scene,
      coverageScore: scene.total_chunks > 0 ? count / scene.total_chunks : 1,
      recordingCount: count,
    };
  });

  if (participantCount <= 2) {
    return selectForSmallGroup(scored, participantCount);
  }

  // Multi-participant: filter by character compatibility
  const compatible = scored.filter((s) => {
    const charCount = s.scene.unique_characters.length;
    if (charCount === 0) return true;
    return participantCount >= charCount;
  });

  if (compatible.length === 0) {
    return selectFromCandidates(scored);
  }

  return selectFromCandidates(compatible);
}

/**
 * For 1-2 people: pick scenes where the top character(s) have
 * a manageable number of dialogue lines (close to the per-person cap).
 * Scenes with characters that have ~8-12 dialogue lines are ideal.
 * Prefer least-covered scenes to spread recordings across the script.
 */
function selectForSmallGroup(candidates: SceneCoverage[], participantCount: number): Scene | null {
  if (candidates.length === 0) return null;

  const cap = MAX_CHUNKS_PER_PERSON;

  // Filter to scenes that have characters (dialogue to perform)
  const withCharacters = candidates.filter(
    (s) => s.scene.unique_characters.length > 0
  );

  // If no scenes with characters, fall back to all scenes
  const pool = withCharacters.length > 0 ? withCharacters : candidates;

  // Score scenes: prefer least-covered, with character count suitable for group
  const scored = pool.map((s) => {
    // Scenes with characters matching participant count are ideal
    const charCount = s.scene.unique_characters.length;
    const charFit = charCount >= 1 && charCount <= participantCount ? 1 : 0;

    // Prefer scenes where chunks per person would be near the cap
    // (not too few, not too many)
    const chunksPerPerson = s.scene.total_chunks / Math.max(participantCount, 1);
    const sizeFit = chunksPerPerson >= 4 && chunksPerPerson <= cap * 1.5 ? 1 : 0;

    return {
      ...s,
      score: (1 - s.coverageScore) * 3 + charFit * 2 + sizeFit,
    };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.score - a.score);

  // Pick from top 3 with slight randomization
  const top = scored.slice(0, Math.min(3, scored.length));
  const idx = Math.floor(Math.random() * top.length);
  return top[idx].scene;
}

function selectFromCandidates(candidates: SceneCoverage[]): Scene | null {
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.coverageScore - b.coverageScore);

  const quartileSize = Math.max(1, Math.ceil(candidates.length / 4));
  const bottomQuartile = candidates.slice(0, quartileSize);

  const idx = Math.floor(Math.random() * bottomQuartile.length);
  return bottomQuartile[idx].scene;
}

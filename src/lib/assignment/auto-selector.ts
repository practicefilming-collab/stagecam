import type { Scene } from '../types';

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

  // Compute coverage scores
  const scored: SceneCoverage[] = scenes.map((scene) => {
    const count = recordingCounts.get(scene.id) ?? 0;
    return {
      scene,
      coverageScore: scene.total_chunks > 0 ? count / scene.total_chunks : 1,
      recordingCount: count,
    };
  });

  if (participantCount === 1) {
    // Solo user: prefer scenes with many chunks (more to perform),
    // TTS fills the rest so bigger scenes give a richer playback.
    // Among least-covered scenes, pick the one with the most chunks.
    return selectForSolo(scored);
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

function selectForSolo(candidates: SceneCoverage[]): Scene | null {
  if (candidates.length === 0) return null;

  // Sort by coverage ascending (least-recorded first)
  candidates.sort((a, b) => a.coverageScore - b.coverageScore);

  // Get bottom half by coverage
  const halfSize = Math.max(1, Math.ceil(candidates.length / 2));
  const leastCovered = candidates.slice(0, halfSize);

  // Among least-covered, prefer scenes with more chunks
  leastCovered.sort((a, b) => b.scene.total_chunks - a.scene.total_chunks);

  // Pick from top 3 (slight randomization)
  const top = leastCovered.slice(0, Math.min(3, leastCovered.length));
  const idx = Math.floor(Math.random() * top.length);
  return top[idx].scene;
}

function selectFromCandidates(candidates: SceneCoverage[]): Scene | null {
  if (candidates.length === 0) return null;

  // Sort by coverage ascending (least-recorded first)
  candidates.sort((a, b) => a.coverageScore - b.coverageScore);

  // Get bottom quartile for randomization
  const quartileSize = Math.max(1, Math.ceil(candidates.length / 4));
  const bottomQuartile = candidates.slice(0, quartileSize);

  // Random pick from bottom quartile
  const idx = Math.floor(Math.random() * bottomQuartile.length);
  return bottomQuartile[idx].scene;
}

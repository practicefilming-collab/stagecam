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

  // Filter scenes compatible with participant count
  const compatible = scored.filter((s) => {
    const charCount = s.scene.unique_characters.length;
    // If no characters, any participant count works
    if (charCount === 0) return true;
    // Need at least as many participants as characters
    return participantCount >= charCount;
  });

  if (compatible.length === 0) {
    // Fall back to all scenes if none are compatible
    return selectFromCandidates(scored);
  }

  return selectFromCandidates(compatible);
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

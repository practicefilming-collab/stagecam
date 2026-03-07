export interface CoverageStats {
  totalChunks: number;
  recordedChunks: number;
  percentage: number;
}

export function computeCoverage(
  totalChunks: number,
  recordedChunkIds: Set<string>
): CoverageStats {
  const recordedChunks = recordedChunkIds.size;
  return {
    totalChunks,
    recordedChunks,
    percentage: totalChunks > 0 ? Math.round((recordedChunks / totalChunks) * 100) : 0,
  };
}

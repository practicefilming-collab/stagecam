/** Coverage calculation: counts recordings against performable chunks per scene. */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CoverageStats {
  totalChunks: number;
  recordedChunks: number;
  percentage: number;
}

export function computeCoverage(
  totalChunks: number,
  recordedCount: number
): CoverageStats {
  return {
    totalChunks,
    recordedChunks: recordedCount,
    percentage: totalChunks > 0 ? Math.round((recordedCount / totalChunks) * 100) : 0,
  };
}

/**
 * Queries recordings grouped by scene, returns Map<sceneId, count>.
 */
export async function fetchSceneCoverageMap(
  supabase: SupabaseClient,
  sceneIds: string[]
): Promise<Map<string, number>> {
  const countMap = new Map<string, number>();
  if (sceneIds.length === 0) return countMap;

  const { data: recordings } = await supabase
    .from('recordings')
    .select('chunk_id, chunks!inner(scene_id)')
    .in('chunks.scene_id', sceneIds);

  (recordings ?? []).forEach((r: Record<string, unknown>) => {
    const chunks = r.chunks as { scene_id: string };
    const sid = chunks.scene_id;
    countMap.set(sid, (countMap.get(sid) ?? 0) + 1);
  });

  return countMap;
}
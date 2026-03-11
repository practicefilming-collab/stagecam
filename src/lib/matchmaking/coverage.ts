/** Coverage calculation: counts recordings against performable lines per scene. */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CoverageStats {
  totalLines: number;
  recordedLines: number;
  percentage: number;
}

export function computeCoverage(
  totalLines: number,
  recordedCount: number
): CoverageStats {
  return {
    totalLines,
    recordedLines: recordedCount,
    percentage: totalLines > 0 ? Math.round((recordedCount / totalLines) * 100) : 0,
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
    const line = r.chunks as { scene_id: string };
    const sid = line.scene_id;
    countMap.set(sid, (countMap.get(sid) ?? 0) + 1);
  });

  return countMap;
}

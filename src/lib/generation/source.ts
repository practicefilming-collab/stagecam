import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerationSourceLine } from './types';

export async function loadGenerationSourceLines(
  admin: SupabaseClient,
  scriptId: string,
  options: { sceneId?: string } = {}
): Promise<GenerationSourceLine[]> {
  let query = admin
    .from('chunks')
    .select(`
      id,
      scene_id,
      chunk_index,
      chunk_in_scene,
      type,
      character,
      tts_text,
      chunk_text,
      is_system,
      scenes!inner(
        id,
        acts!inner(script_id)
      )
    `)
    .eq('scenes.acts.script_id', scriptId)
    .order('chunk_index', { ascending: true });

  if (options.sceneId) {
    query = query.eq('scene_id', options.sceneId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load generation source lines: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    scriptId,
    sceneId: row.scene_id as string,
    chunkIndex: row.chunk_index as number,
    chunkInScene: row.chunk_in_scene as number,
    type: row.type as GenerationSourceLine['type'],
    character: row.character as string | null,
    ttsText: row.tts_text as string | null,
    chunkText: row.chunk_text as string,
    isSystem: Boolean(row.is_system),
  }));
}

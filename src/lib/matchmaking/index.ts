/** Orchestrates matchmaking: scene selection → character assignment → chunk distribution. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chunk } from '../types';
import type {
  MatchmakingContext,
  MatchmakingResult,
  ScoredScene,
  CharacterProfile,
} from './types';
import { fetchSceneCoverageMap } from './coverage';
import { selectScene } from './scene-selector';
import { assignCharacters } from './character-assigner';
import { distributeChunks } from './chunk-distributor';

export type { MatchmakingContext, MatchmakingResult, ParticipantAssignment } from './types';

export async function runMatchmaking(
  supabase: SupabaseClient,
  context: MatchmakingContext
): Promise<MatchmakingResult> {
  let sceneId = context.selectedSceneId;

  // ── Auto mode: select best scene ──
  if (context.selectionMode === 'auto' && !sceneId) {
    // Fetch scenes (optionally filtered by act)
    let scenesQuery = supabase.from('scenes').select('*, acts!inner(act_number, script_id)');

    if (context.selectedActId) {
      scenesQuery = scenesQuery.eq('act_id', context.selectedActId);
    } else {
      scenesQuery = scenesQuery.eq('acts.script_id', context.scriptId);
    }

    const { data: scenes } = await scenesQuery.order('scene_number');

    if (!scenes || scenes.length === 0) {
      throw new Error('No scenes available');
    }

    // Fetch coverage map
    const sceneIds = scenes.map((s) => s.id);
    const coverageMap = await fetchSceneCoverageMap(supabase, sceneIds);

    // Build scored scenes (character_stats is pre-computed in the DB)
    const scoredScenes: ScoredScene[] = scenes.map((s) => {
      const act = s.acts as unknown as { act_number: number };
      const charStats = (s.character_stats ?? []) as { name: string; dialogue_chunks: number; total_chunks: number }[];
      const recordingCount = coverageMap.get(s.id) ?? 0;
      const dialogueChunkCount = charStats.reduce((sum, c) => sum + c.dialogue_chunks, 0);
      const performable = s.performable_chunks ?? s.total_chunks;

      return {
        scene: s,
        actNumber: act.act_number,
        coverageRatio: performable > 0 ? recordingCount / performable : 1,
        recordingCount,
        characterCount: s.unique_characters.length,
        dialogueChunkCount,
      };
    });

    const selected = selectScene(scoredScenes, context.participantIds.length);
    if (!selected) {
      throw new Error('No suitable scene found');
    }
    sceneId = selected.scene.id;
  }

  if (!sceneId) {
    throw new Error('No scene selected');
  }

  // ── Fetch scene + chunks ──
  const { data: scene } = await supabase
    .from('scenes')
    .select('*, acts(act_number)')
    .eq('id', sceneId)
    .single();

  if (!scene) {
    throw new Error('Scene not found');
  }

  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('scene_id', sceneId)
    .order('chunk_in_scene');

  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks in scene');
  }

  // ── Build character profiles from dialogue chunks ──
  const dialogueChunks = (chunks as Chunk[]).filter((c) => c.type === 'dialogue' && c.character);
  const charMap = new Map<string, { count: number; ids: string[] }>();

  for (const chunk of dialogueChunks) {
    const name = chunk.character!;
    const entry = charMap.get(name) ?? { count: 0, ids: [] };
    entry.count++;
    entry.ids.push(chunk.id);
    charMap.set(name, entry);
  }

  const characters: CharacterProfile[] = [...charMap.entries()]
    .map(([name, data]) => ({
      name,
      dialogueChunkCount: data.count,
      chunkIds: data.ids,
    }))
    .sort((a, b) => b.dialogueChunkCount - a.dialogueChunkCount);

  // ── Assign characters + distribute chunks ──
  const characterAssignments = assignCharacters(characters, context.participantIds);
  const assignments = distributeChunks(
    chunks as Chunk[],
    characterAssignments,
    context.participantIds,
    context.participantNames
  );

  const act = scene.acts as unknown as { act_number: number } | null;
  const systemChunkCount = (chunks as Chunk[]).filter((c) => c.is_system).length;
  const performableCount = chunks.length - systemChunkCount;

  return {
    sceneId,
    sceneHeading: scene.scene_heading,
    sceneNumber: scene.scene_number,
    actNumber: act?.act_number ?? 1,
    totalChunks: performableCount,
    systemChunks: systemChunkCount,
    assignments,
  };
}

/**
 * Returns aggregate stats for auto mode preview (no scene selected).
 */
export async function getAutoPreviewStats(
  supabase: SupabaseClient,
  scriptId: string,
  selectedActId: string | null,
  participantCount: number
): Promise<{
  mode: 'auto';
  candidateScenes: number;
  averageCoverage: number;
  participantCount: number;
  estimatedChunksPerPerson: number;
}> {
  let scenesQuery = supabase.from('scenes').select('*, acts!inner(act_number, script_id)');

  if (selectedActId) {
    scenesQuery = scenesQuery.eq('act_id', selectedActId);
  } else {
    scenesQuery = scenesQuery.eq('acts.script_id', scriptId);
  }

  const { data: scenes } = await scenesQuery;

  if (!scenes || scenes.length === 0) {
    return {
      mode: 'auto',
      candidateScenes: 0,
      averageCoverage: 0,
      participantCount,
      estimatedChunksPerPerson: 0,
    };
  }

  const sceneIds = scenes.map((s) => s.id);
  const coverageMap = await fetchSceneCoverageMap(supabase, sceneIds);

  const totalPerformable = scenes.reduce((s, sc) => s + (sc.performable_chunks ?? sc.total_chunks), 0);
  const totalRecorded = [...coverageMap.values()].reduce((s, c) => s + c, 0);
  const avgCoverage = totalPerformable > 0 ? totalRecorded / totalPerformable : 0;

  // Estimate: median performable chunk count / participantCount
  const chunkCounts = scenes.map((s) => s.performable_chunks ?? s.total_chunks).sort((a, b) => a - b);
  const medianChunks = chunkCounts[Math.floor(chunkCounts.length / 2)] ?? 0;
  const estimated = participantCount > 0 ? Math.ceil(medianChunks / participantCount) : 0;

  return {
    mode: 'auto',
    candidateScenes: scenes.length,
    averageCoverage: Math.round(avgCoverage * 100) / 100,
    participantCount,
    estimatedChunksPerPerson: estimated,
  };
}

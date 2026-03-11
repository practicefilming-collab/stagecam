/** Orchestrates matchmaking: scene selection → character assignment → line distribution. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Line } from '../types';
import { getTotalDialogueLines } from '../line-helpers';
import type {
  MatchmakingContext,
  MatchmakingResult,
  ScoredScene,
  CharacterProfile,
} from './types';
import { fetchSceneCoverageMap } from './coverage';
import { selectScene } from './scene-selector';
import { assignCharacters } from './character-assigner';
import { distributeLines } from './line-distributor';

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
      const recordingCount = coverageMap.get(s.id) ?? 0;
      const dialogueLineCount = getTotalDialogueLines(s.character_stats);
      const performable = s.rehearsable_chunks ?? s.total_chunks;

      return {
        scene: s,
        actNumber: act.act_number,
        coverageRatio: performable > 0 ? recordingCount / performable : 1,
        recordingCount,
        characterCount: s.unique_characters.length,
        dialogueLineCount,
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

  // ── Fetch scene + lines ──
  const { data: scene } = await supabase
    .from('scenes')
    .select('*, acts(act_number)')
    .eq('id', sceneId)
    .single();

  if (!scene) {
    throw new Error('Scene not found');
  }

  const { data: lineRows } = await supabase
    .from('chunks')
    .select('*')
    .eq('scene_id', sceneId)
    .order('chunk_in_scene');

  if (!lineRows || lineRows.length === 0) {
    throw new Error('No lines in scene');
  }

  // ── Build character profiles from dialogue lines ──
  const dialogueLines = (lineRows as Line[]).filter((line) => line.type === 'dialogue' && line.character);
  const charMap = new Map<string, { count: number; ids: string[] }>();

  for (const line of dialogueLines) {
    const name = line.character!;
    const entry = charMap.get(name) ?? { count: 0, ids: [] };
    entry.count++;
    entry.ids.push(line.id);
    charMap.set(name, entry);
  }

  const characters: CharacterProfile[] = [...charMap.entries()]
    .map(([name, data]) => ({
      name,
      dialogueLineCount: data.count,
      lineIds: data.ids,
    }))
    .sort((a, b) => b.dialogueLineCount - a.dialogueLineCount);

  // ── Assign characters + distribute lines ──
  const characterAssignments = assignCharacters(characters, context.participantIds, context.roleDraft);
  const assignments = distributeLines(
    lineRows as Line[],
    characterAssignments,
    context.participantIds,
    context.participantNames
  );

  const act = scene.acts as unknown as { act_number: number } | null;
  const systemLineCount = (lineRows as Line[]).filter((line) => line.is_system).length;
  const performableCount = lineRows.length - systemLineCount;

  return {
    sceneId,
    sceneHeading: scene.scene_heading,
    sceneNumber: scene.scene_number,
    actNumber: act?.act_number ?? 1,
    totalLines: performableCount,
    systemLines: systemLineCount,
    assignments,
    characters: characters.map((c) => ({
      name: c.name,
      dialogueCount: c.dialogueLineCount,
    })),
  };
}


import type { AssignedChunk, AssignedLine, Line, Scene, Script } from './types';

// Centralize chunk-shaped DB fields behind line-shaped app helpers.
export function getScriptTotalLines(script: Pick<Script, 'total_chunks'>): number {
  return script.total_chunks;
}

export function getSceneTotalLines(scene: Pick<Scene, 'total_chunks'>): number {
  return scene.total_chunks;
}

export function getSceneRehearsableLines(
  scene: Pick<Scene, 'rehearsable_chunks' | 'total_chunks'>
): number {
  return scene.rehearsable_chunks ?? scene.total_chunks;
}

export function getCharacterDialogueLines(
  characterStats: Scene['character_stats'],
  characterName: string
): number {
  return (characterStats ?? []).find((stat) => stat.name === characterName)?.dialogue_chunks ?? 0;
}

export function getTotalDialogueLines(characterStats: Scene['character_stats']): number {
  return (characterStats ?? []).reduce((sum, stat) => sum + stat.dialogue_chunks, 0);
}

export function getMaxCharacterDialogueLines(characterStats: Scene['character_stats']): number {
  return Math.max(0, ...(characterStats ?? []).map((stat) => stat.dialogue_chunks));
}

export function summarizeCharacterDialogueLines(characterStats: Scene['character_stats']): string {
  return (characterStats ?? []).map((stat) => `${stat.name}: ${stat.dialogue_chunks}`).join(', ');
}

export function getLineText(line: Pick<Line, 'tts_text' | 'chunk_text'>): string {
  return line.tts_text ?? line.chunk_text;
}

export function mapStoredAssignmentToLine(assignment: AssignedChunk): AssignedLine {
  return {
    line_id: assignment.chunk_id,
    role: assignment.role,
    character: assignment.character,
  };
}

export function mapStoredAssignmentsToLines(
  assignments: AssignedChunk[] | null | undefined
): AssignedLine[] {
  return (assignments ?? []).map(mapStoredAssignmentToLine);
}

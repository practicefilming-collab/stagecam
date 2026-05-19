import type {
  AuditionReadinessLevel,
  AuditionScene,
  AuditionTakeRoleAssignment,
} from '@/lib/types';

export interface AuditionSceneRuntimeLine {
  sequenceIndex: number;
  roleName: string | null;
  text: string;
  kind: 'dialogue' | 'cue';
}

export interface AuditionDraftAssignment {
  role_name: string;
  user_id: string | null;
  assignment_type: 'human' | 'fallback_audio';
}

export interface AuditionSceneReadinessSummary {
  level: AuditionReadinessLevel;
  scenePrepared: boolean;
  rolesPrepared: boolean;
  level1Ready: boolean;
  level2Ready: boolean;
  level3Ready: boolean;
  sampleRoleName: string | null;
  sampleLine: string | null;
}

export function parseAuditionSceneRuntimeLines(sceneText: string): AuditionSceneRuntimeLine[] {
  const lines = sceneText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const match = line.match(/^([A-Za-z0-9 .'\-()]+):\s*(.+)$/);
    if (match) {
      return {
        sequenceIndex: index,
        roleName: match[1].trim(),
        text: match[2].trim(),
        kind: 'dialogue' as const,
      };
    }

    return {
      sequenceIndex: index,
      roleName: null,
      text: line,
      kind: 'cue' as const,
    };
  });
}

export function normalizeDraftAssignments(input: {
  roleNames: string[];
  rawAssignments: unknown;
}): AuditionDraftAssignment[] {
  const requested = new Map<string, AuditionDraftAssignment>();
  const raw = Array.isArray(input.rawAssignments) ? input.rawAssignments : [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const roleName = String((item as { role_name?: unknown }).role_name ?? '').trim();
    if (!roleName) continue;
    requested.set(roleName, {
      role_name: roleName,
      user_id: String((item as { user_id?: unknown }).user_id ?? '').trim() || null,
      assignment_type: (String((item as { assignment_type?: unknown }).assignment_type ?? 'human').trim() === 'fallback_audio'
        ? 'fallback_audio'
        : 'human'),
    });
  }

  return input.roleNames.map((roleName) => requested.get(roleName) ?? {
    role_name: roleName,
    user_id: null,
    assignment_type: 'fallback_audio',
  });
}

export function summarizeSceneReadiness(scene: AuditionScene, roleNames: string[]): AuditionSceneReadinessSummary {
  const runtimeLines = parseAuditionSceneRuntimeLines(scene.scene_text);
  const dialogueLines = runtimeLines.filter((line) => line.kind === 'dialogue');
  const processingMetadata = scene.processing_metadata ?? {};
  const ai = (processingMetadata.ai ?? {}) as Record<string, unknown>;
  const requestedLevel = String(processingMetadata.readiness_level ?? '').trim();
  const scenePrepared = Boolean(scene.scene_text.trim());
  const rolesPrepared = roleNames.length > 0;
  const level1Ready = scenePrepared && rolesPrepared;
  const level2Ready = level1Ready && Boolean(ai.level2_ready);
  const level3Ready = level2Ready && Boolean(ai.level3_ready);

  let level: AuditionReadinessLevel = 'not_started';
  if (level3Ready || requestedLevel === 'level_3_ready') {
    level = 'level_3_ready';
  } else if (level2Ready || requestedLevel === 'level_2_ready') {
    level = 'level_2_ready';
  } else if (level1Ready || requestedLevel === 'level_1_ready') {
    level = 'level_1_ready';
  }

  const sampleLine = dialogueLines[0] ?? runtimeLines[0] ?? null;

  return {
    level,
    scenePrepared,
    rolesPrepared,
    level1Ready,
    level2Ready,
    level3Ready,
    sampleRoleName: sampleLine?.roleName ?? null,
    sampleLine: sampleLine?.text ?? null,
  };
}

export function rolesForUser(assignments: AuditionTakeRoleAssignment[], userId: string) {
  return assignments
    .filter((assignment) => assignment.user_id === userId && assignment.assignment_type === 'human')
    .map((assignment) => assignment.role_name);
}

export function runtimeLinesForAssignments(
  sceneText: string,
  assignments: AuditionTakeRoleAssignment[],
  userId: string,
) {
  const ownedRoles = new Set(rolesForUser(assignments, userId));
  return parseAuditionSceneRuntimeLines(sceneText).filter((line) =>
    line.kind === 'dialogue' && line.roleName && ownedRoles.has(line.roleName),
  );
}

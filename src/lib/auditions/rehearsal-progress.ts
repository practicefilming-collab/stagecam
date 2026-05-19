import type {
  AuditionRoomParticipant,
  AuditionTakeClip,
  AuditionTakeRoleAssignment,
} from '@/lib/types';
import { parseAuditionSceneRuntimeLines } from './scene-runtime';

export interface AuditionParticipantRehearsalProgress {
  userId: string;
  displayName: string | null;
  roleType: AuditionRoomParticipant['role_type'];
  assignedRoleNames: string[];
  assignedLineCount: number;
  uploadedLineCount: number;
  remainingLineCount: number;
  status: 'fallback_only' | 'idle' | 'recording' | 'awaiting_uploads' | 'complete';
  isComplete: boolean;
  lastUpdatedAt: string | null;
}

export function buildParticipantRehearsalProgress(input: {
  sceneText: string;
  participants: Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>;
  assignments: AuditionTakeRoleAssignment[];
  clips: AuditionTakeClip[];
}) {
  const runtimeLines = parseAuditionSceneRuntimeLines(input.sceneText);
  const humanAssignmentsByUser = new Map<string, AuditionTakeRoleAssignment[]>();
  for (const assignment of input.assignments) {
    if (assignment.assignment_type !== 'human' || !assignment.user_id) continue;
    const list = humanAssignmentsByUser.get(assignment.user_id) ?? [];
    list.push(assignment);
    humanAssignmentsByUser.set(assignment.user_id, list);
  }

  const uploadedSequenceByUser = new Map<string, Set<number>>();
  for (const clip of input.clips) {
    const list = uploadedSequenceByUser.get(clip.actor_user_id) ?? new Set<number>();
    list.add(clip.sequence_index);
    uploadedSequenceByUser.set(clip.actor_user_id, list);
  }

  return input.participants.map((participant) => {
    const assignments = humanAssignmentsByUser.get(participant.user_id) ?? [];
    const assignedRoleNames = assignments.map((assignment) => assignment.role_name);
    const assignedRolesSet = new Set(assignedRoleNames);
    const assignedLineCount = runtimeLines.filter((line) =>
      line.kind === 'dialogue' && line.roleName && assignedRolesSet.has(line.roleName),
    ).length;
    const uploadedLineCount = uploadedSequenceByUser.get(participant.user_id)?.size ?? 0;
    const remainingLineCount = Math.max(0, assignedLineCount - uploadedLineCount);
    const rawState = participant.recording_state ?? 'idle';
    const status = assignedLineCount === 0
      ? 'fallback_only'
      : remainingLineCount === 0
        ? 'complete'
        : rawState === 'awaiting_uploads'
          ? 'awaiting_uploads'
          : rawState === 'recording'
            ? 'recording'
            : 'idle';

    return {
      userId: participant.user_id,
      displayName: participant.profiles?.display_name ?? null,
      roleType: participant.role_type,
      assignedRoleNames,
      assignedLineCount,
      uploadedLineCount,
      remainingLineCount,
      status,
      isComplete: remainingLineCount === 0,
      lastUpdatedAt: participant.recording_state_updated_at ?? null,
    } satisfies AuditionParticipantRehearsalProgress;
  });
}

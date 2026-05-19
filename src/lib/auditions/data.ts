import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AuditionAttempt,
  AuditionRoomParticipant,
  AuditionRole,
  AuditionScene,
  AuditionSceneProgress,
  AuditionScript,
  AuditionTake,
  AuditionTakeClip,
  AuditionTakeRoleAssignment,
  AuditionTargetRole,
  Profile,
  Script,
} from '@/lib/types';
import { summarizeSceneReadiness } from './scene-runtime';

export interface AuditionSceneWithRoles extends AuditionScene {
  roles: AuditionRole[];
}

export interface AuditionDetail {
  script: AuditionScript;
  assignedRehearser: Pick<Profile, 'id' | 'display_name' | 'auditions_enabled' | 'is_admin'> | null;
  uploader: Pick<Profile, 'id' | 'display_name'> | null;
  processor: Pick<Profile, 'id' | 'display_name'> | null;
  scenes: AuditionSceneWithRoles[];
  targetRole: AuditionTargetRole | null;
  progress: AuditionSceneProgress[];
  linkedScript: Pick<Script, 'id' | 'title' | 'slug' | 'is_internal'> | null;
}

export interface AuditionScriptListItem extends AuditionScript {
  assignedRehearser: Pick<Profile, 'id' | 'display_name'> | null;
}

export interface AuditionTakeSummary extends AuditionTake {
  assignments: AuditionTakeRoleAssignment[];
  clipCount: number;
  participantIds: string[];
}

export interface AuditionTakeDetail extends AuditionTakeSummary {
  clips: Array<AuditionTakeClip & { signed_url?: string | null }>;
  participants: Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>;
}

export async function listAuditionScriptsForViewer(viewer: {
  userId: string;
  profile: Pick<Profile, 'is_admin'>;
}) {
  const admin = createAdminClient();
  let query = admin
    .from('audition_scripts')
    .select('*, assigned_rehearser:profiles!audition_scripts_assigned_rehearser_user_id_fkey(id, display_name)')
    .order('created_at', { ascending: false });

  if (!viewer.profile.is_admin) {
    const { data: relationshipRows, error: relationshipError } = await admin
      .from('audition_script_relationships')
      .select('audition_script_id')
      .eq('related_user_id', viewer.userId);

    if (relationshipError) throw relationshipError;

    const relatedIds = [...new Set((relationshipRows ?? []).map((row) => row.audition_script_id as string))];
    if (relatedIds.length > 0) {
      query = query.or([
        `assigned_rehearser_user_id.eq.${viewer.userId}`,
        `id.in.(${relatedIds.join(',')})`,
      ].join(','));
    } else {
      query = query.eq('assigned_rehearser_user_id', viewer.userId);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Array<AuditionScript & {
    assigned_rehearser?: { id: string; display_name: string } | null;
  }>).map((row) => ({
    ...row,
    assignedRehearser: row.assigned_rehearser ?? null,
  }));
}

export async function getAuditionDetail(auditionId: string): Promise<AuditionDetail | null> {
  const admin = createAdminClient();

  const { data: script, error } = await admin
    .from('audition_scripts')
    .select('*')
    .eq('id', auditionId)
    .maybeSingle();

  if (error) throw error;
  if (!script) return null;

  const [{ data: sceneRows }, { data: targetRoleRows }, { data: progressRows }, { data: profileRows }, { data: linkedScript }] = await Promise.all([
    admin
      .from('audition_scenes')
      .select('*, audition_roles(*)')
      .eq('audition_script_id', auditionId)
      .order('order_index', { ascending: true }),
    admin
      .from('audition_target_roles')
      .select('*')
      .eq('audition_script_id', auditionId)
      .eq('assigned_rehearser_user_id', script.assigned_rehearser_user_id),
    admin
      .from('audition_scene_progress')
      .select('*')
      .eq('audition_script_id', auditionId)
      .eq('assigned_rehearser_user_id', script.assigned_rehearser_user_id),
    admin
      .from('profiles')
      .select('id, display_name, auditions_enabled, is_admin')
      .in('id', [
        script.assigned_rehearser_user_id,
        script.uploaded_by_user_id,
        script.processed_by_admin_id,
      ].filter(Boolean)),
    admin
      .from('scripts')
      .select('id, title, slug, is_internal')
      .eq('source_audition_script_id', auditionId)
      .maybeSingle(),
  ]);

  const profileMap = new Map<string, Pick<Profile, 'id' | 'display_name' | 'auditions_enabled' | 'is_admin'>>();
  for (const profile of profileRows ?? []) {
    profileMap.set(profile.id, profile as Pick<Profile, 'id' | 'display_name' | 'auditions_enabled' | 'is_admin'>);
  }

  const scenes = ((sceneRows ?? []) as (AuditionScene & { audition_roles?: AuditionRole[] })[]).map((scene) => ({
    ...scene,
    roles: (scene.audition_roles ?? []).sort((a, b) => a.order_index - b.order_index),
  }));

  return {
    script: script as AuditionScript,
    assignedRehearser: profileMap.get(script.assigned_rehearser_user_id) ?? null,
    uploader: profileMap.get(script.uploaded_by_user_id)
      ? {
          id: profileMap.get(script.uploaded_by_user_id)!.id,
          display_name: profileMap.get(script.uploaded_by_user_id)!.display_name,
        }
      : null,
    processor: script.processed_by_admin_id && profileMap.get(script.processed_by_admin_id)
      ? {
          id: profileMap.get(script.processed_by_admin_id)!.id,
          display_name: profileMap.get(script.processed_by_admin_id)!.display_name,
        }
      : null,
    scenes,
    targetRole: ((targetRoleRows ?? [])[0] as AuditionTargetRole | undefined) ?? null,
    progress: (progressRows ?? []) as AuditionSceneProgress[],
    linkedScript: (linkedScript as Pick<Script, 'id' | 'title' | 'slug' | 'is_internal'> | null) ?? null,
  };
}

export async function listTakesForScene(params: {
  sceneId: string;
}): Promise<AuditionTakeSummary[]> {
  const admin = createAdminClient();
  const { data: takes, error } = await admin
    .from('audition_takes')
    .select('*')
    .eq('audition_scene_id', params.sceneId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const takeIds = (takes ?? []).map((take) => take.id as string);
  if (takeIds.length === 0) return [];

  const [{ data: assignments }, { data: clips }] = await Promise.all([
    admin
      .from('audition_take_role_assignments')
      .select('*')
      .in('take_id', takeIds),
    admin
      .from('audition_take_clips')
      .select('id, take_id, actor_user_id')
      .in('take_id', takeIds),
  ]);

  const assignmentsByTake = new Map<string, AuditionTakeRoleAssignment[]>();
  for (const assignment of (assignments ?? []) as AuditionTakeRoleAssignment[]) {
    const list = assignmentsByTake.get(assignment.take_id) ?? [];
    list.push(assignment);
    assignmentsByTake.set(assignment.take_id, list);
  }

  const clipCountByTake = new Map<string, number>();
  const participantsByTake = new Map<string, Set<string>>();
  for (const clip of (clips ?? []) as Array<Pick<AuditionTakeClip, 'take_id' | 'actor_user_id'>>) {
    clipCountByTake.set(clip.take_id, (clipCountByTake.get(clip.take_id) ?? 0) + 1);
    const set = participantsByTake.get(clip.take_id) ?? new Set<string>();
    set.add(clip.actor_user_id);
    participantsByTake.set(clip.take_id, set);
  }

  return ((takes ?? []) as AuditionTake[]).map((take) => ({
    ...take,
    assignments: assignmentsByTake.get(take.id) ?? [],
    clipCount: clipCountByTake.get(take.id) ?? 0,
    participantIds: Array.from(participantsByTake.get(take.id) ?? []),
  }));
}

export async function getAuditionTakeDetail(takeId: string): Promise<AuditionTakeDetail | null> {
  const admin = createAdminClient();
  const { data: take, error } = await admin
    .from('audition_takes')
    .select('*')
    .eq('id', takeId)
    .maybeSingle();

  if (error) throw error;
  if (!take) return null;

  const [{ data: assignments }, { data: clips }, { data: participants }] = await Promise.all([
    admin
      .from('audition_take_role_assignments')
      .select('*')
      .eq('take_id', takeId)
      .order('role_name'),
    admin
      .from('audition_take_clips')
      .select('*')
      .eq('take_id', takeId)
      .order('sequence_index')
      .order('created_at'),
    take.room_session_id
      ? admin
          .from('audition_room_participants')
          .select('*, profiles(display_name)')
          .eq('room_session_id', take.room_session_id)
          .order('joined_at')
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);

  return {
    ...(take as AuditionTake),
    assignments: (assignments ?? []) as AuditionTakeRoleAssignment[],
    clipCount: (clips ?? []).length,
    participantIds: [...new Set((clips ?? []).map((clip) => clip.actor_user_id as string))],
    clips: (clips ?? []) as AuditionTakeClip[],
    participants: (participants ?? []) as Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>,
  };
}

export function summarizeAuditionSceneCard(scene: AuditionSceneWithRoles) {
  return summarizeSceneReadiness(scene, scene.roles.map((role) => role.name));
}

export async function listAttemptsForScene(params: {
  auditionId: string;
  sceneId: string;
  userId?: string;
}): Promise<AuditionAttempt[]> {
  const admin = createAdminClient();
  let query = admin
    .from('audition_attempts')
    .select('*')
    .eq('audition_script_id', params.auditionId)
    .eq('audition_scene_id', params.sceneId)
    .order('created_at', { ascending: false });

  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditionAttempt[];
}

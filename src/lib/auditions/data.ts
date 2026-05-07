import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AuditionAttempt,
  AuditionRole,
  AuditionScene,
  AuditionSceneProgress,
  AuditionScript,
  AuditionTargetRole,
  Profile,
  Script,
} from '@/lib/types';

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

export async function listAuditionScriptsForViewer(viewer: {
  userId: string;
  profile: Pick<Profile, 'is_admin'>;
}) {
  const admin = createAdminClient();
  let query = admin
    .from('audition_scripts')
    .select('*')
    .order('created_at', { ascending: false });

  if (!viewer.profile.is_admin) {
    query = query.eq('assigned_rehearser_user_id', viewer.userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditionScript[];
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

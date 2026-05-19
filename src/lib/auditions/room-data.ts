import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditionScript, AuditionTake, AuditionTakeClip, AuditionTakeRoleAssignment, Script } from '@/lib/types';
import { loadAuditionSharedAudioCoverage, mergeLevel1AudioMetadata } from './level1-audio';
import { buildParticipantRehearsalProgress } from './rehearsal-progress';

export async function getAuditionRoomBundle(roomCode: string) {
  const admin = createAdminClient();
  const { data: room, error } = await admin
    .from('audition_room_sessions')
    .select('*')
    .eq('room_code', roomCode)
    .maybeSingle();

  if (error) throw error;
  if (!room) return null;

  const [{ data: script }, { data: scenes }, { data: targetRoles }, { data: participants }, { data: activeTake }, { data: activeTakeAssignments }, { data: activeTakeClips }, { data: linkedScript }] = await Promise.all([
    admin.from('audition_scripts').select('*').eq('id', room.audition_script_id).single(),
    admin.from('audition_scenes').select('*, audition_roles(*)').eq('audition_script_id', room.audition_script_id).eq('is_active', true).order('order_index'),
    admin.from('audition_target_roles').select('*').eq('audition_script_id', room.audition_script_id),
    admin.from('audition_room_participants').select('*, profiles(display_name)').eq('room_session_id', room.id).order('joined_at'),
    room.active_take_id
      ? admin.from('audition_takes').select('*').eq('id', room.active_take_id).maybeSingle()
      : Promise.resolve({ data: null as AuditionTake | null, error: null }),
    room.active_take_id
      ? admin.from('audition_take_role_assignments').select('*').eq('take_id', room.active_take_id).order('role_name')
      : Promise.resolve({ data: [] as AuditionTakeRoleAssignment[], error: null }),
    room.active_take_id
      ? admin.from('audition_take_clips').select('*').eq('take_id', room.active_take_id)
      : Promise.resolve({ data: [] as AuditionTakeClip[], error: null }),
    admin.from('scripts').select('id').eq('source_audition_script_id', room.audition_script_id).maybeSingle(),
  ]);

  const sceneRows = (scenes ?? []);
  const level1Coverage = await loadAuditionSharedAudioCoverage({
    admin,
    audition: script as Pick<AuditionScript, 'id' | 'processing_notes'>,
    linkedScriptId: (linkedScript as Pick<Script, 'id'> | null)?.id ?? null,
    auditionScenes: sceneRows,
  });

  const activeScene = sceneRows.find((scene) => scene.id === room.active_scene_id) ?? sceneRows[0] ?? null;

  return {
    room,
    script,
    scenes: mergeLevel1AudioMetadata(sceneRows, level1Coverage),
    targetRole: (targetRoles ?? [])[0] ?? null,
    participants: participants ?? [],
    activeTake: (activeTake as AuditionTake | null) ?? null,
    activeTakeAssignments: (activeTakeAssignments ?? []) as AuditionTakeRoleAssignment[],
    participantProgress: activeScene
      ? buildParticipantRehearsalProgress({
          sceneText: activeScene.scene_text,
          participants: (participants ?? []) as Array<Parameters<typeof buildParticipantRehearsalProgress>[0]['participants'][number]>,
          assignments: (activeTakeAssignments ?? []) as AuditionTakeRoleAssignment[],
          clips: (activeTakeClips ?? []) as AuditionTakeClip[],
        })
      : [],
  };
}

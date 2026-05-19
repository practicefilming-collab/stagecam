import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditionTake, AuditionTakeRoleAssignment } from '@/lib/types';

export async function getAuditionRoomBundle(roomCode: string) {
  const admin = createAdminClient();
  const { data: room, error } = await admin
    .from('audition_room_sessions')
    .select('*')
    .eq('room_code', roomCode)
    .maybeSingle();

  if (error) throw error;
  if (!room) return null;

  const [{ data: script }, { data: scenes }, { data: targetRoles }, { data: participants }, { data: activeTake }, { data: activeTakeAssignments }] = await Promise.all([
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
  ]);

  return {
    room,
    script,
    scenes: scenes ?? [],
    targetRole: (targetRoles ?? [])[0] ?? null,
    participants: participants ?? [],
    activeTake: (activeTake as AuditionTake | null) ?? null,
    activeTakeAssignments: (activeTakeAssignments ?? []) as AuditionTakeRoleAssignment[],
  };
}

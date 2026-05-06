import { createAdminClient } from '@/lib/supabase/admin';

export async function getAuditionRoomBundle(roomCode: string) {
  const admin = createAdminClient();
  const { data: room, error } = await admin
    .from('audition_room_sessions')
    .select('*')
    .eq('room_code', roomCode)
    .maybeSingle();

  if (error) throw error;
  if (!room) return null;

  const [{ data: script }, { data: scenes }, { data: targetRoles }, { data: participants }] = await Promise.all([
    admin.from('audition_scripts').select('*').eq('id', room.audition_script_id).single(),
    admin.from('audition_scenes').select('*, audition_roles(*)').eq('audition_script_id', room.audition_script_id).eq('is_active', true).order('order_index'),
    admin.from('audition_target_roles').select('*').eq('audition_script_id', room.audition_script_id),
    admin.from('audition_room_participants').select('*, profiles(display_name)').eq('room_session_id', room.id).order('joined_at'),
  ]);

  return {
    room,
    script,
    scenes: scenes ?? [],
    targetRole: (targetRoles ?? [])[0] ?? null,
    participants: participants ?? [],
  };
}

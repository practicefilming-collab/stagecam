import { canAccessAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';
import { generateUniqueAuditionRoomCode } from '@/lib/auditions/rooms';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const detail = await getAuditionDetail(auditionId);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessAuditionScript(viewer, detail.script)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!viewer.profile.is_admin && detail.script.assigned_rehearser_user_id !== viewer.userId) {
    return NextResponse.json({ error: 'Only the assigned rehearser or an admin can host a room' }, { status: 403 });
  }

  if (detail.script.status !== 'ready') {
    return NextResponse.json({ error: 'This audition must be marked ready before a room can be hosted' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const activeSceneId = String(body.active_scene_id ?? detail.scenes[0]?.id ?? '').trim();
  if (!activeSceneId) {
    return NextResponse.json({ error: 'An active scene is required before starting a room' }, { status: 400 });
  }

  const admin = createAdminClient();
  const roomCode = await generateUniqueAuditionRoomCode(admin);
  const status = body.status === 'active' ? 'active' : 'waiting';
  const { data: room, error } = await admin
    .from('audition_room_sessions')
    .insert({
      audition_script_id: auditionId,
      active_scene_id: activeSceneId,
      host_user_id: viewer.userId,
      room_code: roomCode,
      status,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('audition_room_participants').upsert({
    room_session_id: room.id,
    user_id: viewer.userId,
    role_type: viewer.profile.is_admin ? 'admin' : 'assigned_rehearser',
    joined_at: new Date().toISOString(),
    left_at: null,
  }, {
    onConflict: 'room_session_id,user_id',
  });

  return NextResponse.json(room, { status: 201 });
}

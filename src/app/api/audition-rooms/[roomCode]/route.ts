import { getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bundle = await getAuditionRoomBundle(roomCode);
  if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = viewer.profile.is_admin;
  const isAssignedRehearser = bundle.script.assigned_rehearser_user_id === viewer.userId;
  const isHost = bundle.room.host_user_id === viewer.userId;

  if (!isAdmin && !isAssignedRehearser && bundle.room.status === 'ended') {
    return NextResponse.json({ error: 'This room has ended' }, { status: 403 });
  }

  const roleType = isAdmin
    ? 'admin'
    : isHost
      ? 'host'
      : isAssignedRehearser
        ? 'assigned_rehearser'
        : 'guest';

  const admin = createAdminClient();
  await admin
    .from('audition_room_participants')
    .upsert({
      room_session_id: bundle.room.id,
      user_id: viewer.userId,
      role_type: roleType,
      left_at: null,
    }, {
      onConflict: 'room_session_id,user_id',
    });

  return NextResponse.json({
    ...bundle,
    viewer_role: roleType,
    can_control_room: isAdmin || isHost || isAssignedRehearser,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bundle = await getAuditionRoomBundle(roomCode);
  if (!bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const canControl = viewer.profile.is_admin || bundle.room.host_user_id === viewer.userId || bundle.script.assigned_rehearser_user_id === viewer.userId;
  if (!canControl) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.active_scene_id === 'string' && body.active_scene_id.trim()) {
    updates.active_scene_id = body.active_scene_id.trim();
  }
  if (typeof body.status === 'string') {
    updates.status = body.status;
    if (body.status === 'ended') {
      updates.ended_at = new Date().toISOString();
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audition_room_sessions')
    .update(updates)
    .eq('id', bundle.room.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.status === 'ended') {
    await admin
      .from('audition_room_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('room_session_id', bundle.room.id)
      .is('left_at', null);
  }

  return NextResponse.json(data);
}

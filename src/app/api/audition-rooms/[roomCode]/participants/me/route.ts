import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const ALLOWED_STATES = new Set(['idle', 'recording', 'awaiting_uploads', 'complete']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bundle = await getAuditionRoomBundle(roomCode);
  if (!bundle) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const access = await getAuditionScriptAccessContext({ viewer, script: bundle.script });
  if (!access.canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as { recording_state?: string; take_id?: string | null }));
  const recordingState = typeof body.recording_state === 'string' && ALLOWED_STATES.has(body.recording_state)
    ? body.recording_state
    : null;
  if (!recordingState) {
    return NextResponse.json({ error: 'Invalid recording_state' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audition_room_participants')
    .update({
      recording_state: recordingState,
      recording_state_take_id: typeof body.take_id === 'string' ? body.take_id : null,
      recording_state_updated_at: new Date().toISOString(),
    })
    .eq('room_session_id', bundle.room.id)
    .eq('user_id', viewer.userId)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not update participant state' }, { status: 500 });
  }

  return NextResponse.json(data);
}

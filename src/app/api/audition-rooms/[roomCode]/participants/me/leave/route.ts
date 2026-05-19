import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { normalizeDraftAssignments, type AuditionDraftAssignment } from '@/lib/auditions/scene-runtime';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
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

  const activeScene = bundle.scenes.find((scene) => scene.id === bundle.room.active_scene_id) ?? bundle.scenes[0] ?? null;
  const roleNames = ((activeScene?.audition_roles ?? []) as Array<{ name: string }>).map((role) => role.name);
  const nextAssignments = normalizeDraftAssignments({
    roleNames,
    rawAssignments: (bundle.room.draft_assignments as AuditionDraftAssignment[] | null) ?? [],
  }).map((assignment) => (
    assignment.user_id === viewer.userId
      ? {
          ...assignment,
          user_id: null,
          assignment_type: 'fallback_audio' as const,
        }
      : assignment
  ));

  const admin = createAdminClient();
  const leftAt = new Date().toISOString();
  const { error: participantError } = await admin
    .from('audition_room_participants')
    .update({
      left_at: leftAt,
      recording_state: 'idle',
      recording_state_take_id: null,
      recording_state_updated_at: leftAt,
    })
    .eq('room_session_id', bundle.room.id)
    .eq('user_id', viewer.userId);

  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 });
  }

  const { error: roomError } = await admin
    .from('audition_room_sessions')
    .update({ draft_assignments: nextAssignments })
    .eq('id', bundle.room.id);

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, left_at: leftAt, draft_assignments: nextAssignments });
}

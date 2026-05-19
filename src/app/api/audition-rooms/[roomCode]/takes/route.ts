import {
  getAuditionScriptAccessContext,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { normalizeDraftAssignments } from '@/lib/auditions/scene-runtime';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bundle = await getAuditionRoomBundle(roomCode);
  if (!bundle) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const access = await getAuditionScriptAccessContext({ viewer, script: bundle.script });
  const canControl = access.canControlRoom || bundle.room.host_user_id === viewer.userId;
  if (!canControl) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const activeScene = bundle.scenes.find((scene) => scene.id === bundle.room.active_scene_id) ?? bundle.scenes[0];
  if (!activeScene) {
    return NextResponse.json({ error: 'No active scene is available for this room' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as { assignments?: unknown; title?: string; notes?: string }));
  const roleNames = ((activeScene.audition_roles ?? []) as Array<{ id: string; name: string }>).map((role) => role.name);
  const assignments = normalizeDraftAssignments({
    roleNames,
    rawAssignments: body.assignments ?? bundle.room.draft_assignments,
  });

  const admin = createAdminClient();
  const { data: take, error } = await admin
    .from('audition_takes')
    .insert({
      audition_script_id: bundle.script.id,
      audition_scene_id: activeScene.id,
      room_session_id: bundle.room.id,
      status: 'recording',
      started_by_user_id: viewer.userId,
      title: String(body.title ?? '').trim() || `${activeScene.label} Take ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      notes: String(body.notes ?? '').trim() || null,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !take) {
    return NextResponse.json({ error: error?.message ?? 'Could not create take' }, { status: 500 });
  }

  const roleLookup = new Map(
    ((activeScene.audition_roles ?? []) as Array<{ id: string; name: string }>).map((role) => [role.name, role.id]),
  );
  const { error: assignmentError } = await admin
    .from('audition_take_role_assignments')
    .insert(assignments.map((assignment) => ({
      take_id: take.id,
      audition_role_id: roleLookup.get(assignment.role_name) ?? null,
      role_name: assignment.role_name,
      user_id: assignment.assignment_type === 'human' ? assignment.user_id : null,
      assignment_type: assignment.assignment_type,
    })));

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  }

  await admin
    .from('audition_room_sessions')
    .update({
      active_take_id: take.id,
      status: 'active',
      draft_assignments: assignments,
    })
    .eq('id', bundle.room.id);

  return NextResponse.json({
    take,
    assignments,
  }, { status: 201 });
}

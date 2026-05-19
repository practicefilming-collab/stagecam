import {
  ensureAuditionScenarioRelationship,
  formatAuditionRelationshipLabel,
  getAuditionScriptAccessContext,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';
import { normalizeDraftAssignments } from '@/lib/auditions/scene-runtime';
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

  const access = await getAuditionScriptAccessContext({ viewer, script: bundle.script });
  const isAssignedRehearser = access.viewerRole === 'assigned_rehearser';
  const isAdmin = access.viewerRole === 'admin';
  const isHost = bundle.room.host_user_id === viewer.userId;

  if (!access.canAccess && bundle.room.status === 'ended') {
    return NextResponse.json({ error: 'This room has ended' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!access.canAccess) {
    await ensureAuditionScenarioRelationship({
      admin,
      auditionScriptId: bundle.script.id,
      assignedRehearserUserId: bundle.script.assigned_rehearser_user_id,
      relatedUserId: viewer.userId,
      relationshipType: 'rehearsal_partner_to_assignee',
      scenarioSource: 'room_participation',
      roomSessionId: bundle.room.id,
    });
  }

  const roleType = isAdmin
    ? 'admin'
    : isHost
      ? 'host'
      : isAssignedRehearser
        ? 'assigned_rehearser'
        : 'guest';

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

  const refreshedBundle = await getAuditionRoomBundle(roomCode);
  if (!refreshedBundle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...refreshedBundle,
    viewer_user_id: viewer.userId,
    viewer_role: roleType,
    relationship_label: access.canAccess
      ? access.relationshipLabel
      : formatAuditionRelationshipLabel({ relationshipType: 'rehearsal_partner_to_assignee' }),
    can_control_room: access.canAccess || isHost || isAssignedRehearser,
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

  const access = await getAuditionScriptAccessContext({ viewer, script: bundle.script });
  const canControl = access.canControlRoom || bundle.room.host_user_id === viewer.userId;
  if (!canControl) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  const activeScene = bundle.scenes.find((scene) => scene.id === (typeof body.active_scene_id === 'string' ? body.active_scene_id.trim() : bundle.room.active_scene_id))
    ?? bundle.scenes.find((scene) => scene.id === bundle.room.active_scene_id)
    ?? bundle.scenes[0];
  if (typeof body.active_scene_id === 'string' && body.active_scene_id.trim()) {
    updates.active_scene_id = body.active_scene_id.trim();
  }
  if (body.draft_assignments !== undefined && activeScene) {
    const roleNames = ((activeScene.audition_roles ?? []) as Array<{ name: string }>).map((role) => role.name);
    updates.draft_assignments = normalizeDraftAssignments({
      roleNames,
      rawAssignments: body.draft_assignments,
    });
  }
  if (body.clear_active_take === true) {
    updates.active_take_id = null;
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

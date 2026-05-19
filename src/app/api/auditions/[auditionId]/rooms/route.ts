import {
  ensureAuditionScenarioRelationship,
  getAuditionScriptAccessContext,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';
import { normalizeDraftAssignments } from '@/lib/auditions/scene-runtime';
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
  const access = await getAuditionScriptAccessContext({ viewer, script: detail.script });
  if (!access.canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!access.canControlRoom) {
    return NextResponse.json({ error: 'Only a privy viewer can host a room' }, { status: 403 });
  }

  if (detail.script.status !== 'ready') {
    return NextResponse.json({ error: 'This audition must be marked ready before a room can be hosted' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const activeSceneId = String(body.active_scene_id ?? detail.scenes[0]?.id ?? '').trim();
  if (!activeSceneId) {
    return NextResponse.json({ error: 'An active scene is required before starting a room' }, { status: 400 });
  }
  const activeScene = detail.scenes.find((scene) => scene.id === activeSceneId) ?? detail.scenes[0];
  const draftAssignments = normalizeDraftAssignments({
    roleNames: activeScene?.roles.map((role) => role.name) ?? [],
    rawAssignments: [],
  });

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
      draft_assignments: draftAssignments,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (access.viewerRole === 'rehearsal_partner') {
    await ensureAuditionScenarioRelationship({
      admin,
      auditionScriptId: auditionId,
      assignedRehearserUserId: detail.script.assigned_rehearser_user_id,
      relatedUserId: viewer.userId,
      relationshipType: 'rehearsal_partner_to_assignee',
      scenarioSource: 'room_participation',
      roomSessionId: room.id,
    });
  }

  await admin.from('audition_room_participants').upsert({
    room_session_id: room.id,
    user_id: viewer.userId,
    role_type: access.viewerRole === 'admin'
      ? 'admin'
      : access.viewerRole === 'assigned_rehearser'
        ? 'assigned_rehearser'
        : 'host',
    joined_at: new Date().toISOString(),
    left_at: null,
  }, {
    onConflict: 'room_session_id,user_id',
  });

  return NextResponse.json(room, { status: 201 });
}

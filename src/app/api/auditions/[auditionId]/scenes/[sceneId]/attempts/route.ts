import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionDetail, listAttemptsForScene } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ auditionId: string; sceneId: string }> },
) {
  const { auditionId, sceneId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const detail = await getAuditionDetail(auditionId);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const access = await getAuditionScriptAccessContext({ viewer, script: detail.script });
  if (!access.canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const includeAll = searchParams.get('all') === '1' && access.viewerRole === 'admin';
  const attempts = await listAttemptsForScene({
    auditionId,
    sceneId,
    userId: includeAll || access.viewerRole === 'assigned_rehearser' ? undefined : viewer.userId,
  });
  return NextResponse.json(attempts);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string; sceneId: string }> },
) {
  const { auditionId, sceneId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const detail = await getAuditionDetail(auditionId);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const access = await getAuditionScriptAccessContext({ viewer, script: detail.script });
  if (!access.canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const practiceMode = String(body.practice_mode ?? '').trim();
  const progressionStep = String(body.progression_step ?? '').trim();
  const selectedRoleName = String(body.selected_role_name ?? detail.targetRole?.selected_role_name ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const roomSessionId = String(body.room_session_id ?? '').trim();
  const completed = Boolean(body.completed);

  if (!practiceMode || !progressionStep || !selectedRoleName) {
    return NextResponse.json({ error: 'practice_mode, progression_step, and selected_role_name are required' }, { status: 400 });
  }

  const ownershipType = access.viewerRole === 'assigned_rehearser'
    ? 'assigned_rehearser'
    : 'guest_participant';

  const admin = createAdminClient();
  const selectedRole = detail.scenes
    .flatMap((scene) => scene.roles)
    .find((role) => role.name === selectedRoleName);

  const { data, error } = await admin
    .from('audition_attempts')
    .insert({
      user_id: viewer.userId,
      audition_script_id: auditionId,
      audition_scene_id: sceneId,
      audition_role_id: selectedRole?.id ?? null,
      selected_role_name: selectedRoleName,
      practice_mode: practiceMode,
      progression_step: progressionStep,
      ownership_type: ownershipType,
      room_session_id: roomSessionId || null,
      notes: notes || null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

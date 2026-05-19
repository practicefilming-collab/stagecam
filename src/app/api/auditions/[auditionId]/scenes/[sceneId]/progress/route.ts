import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

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
  if (access.viewerRole !== 'admin' && access.viewerRole !== 'assigned_rehearser') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const progressionStep = String(body.progression_step ?? '').trim();
  const selectedRoleName = String(body.selected_role_name ?? detail.targetRole?.selected_role_name ?? '').trim();
  const isComplete = Boolean(body.is_complete);

  if (!progressionStep || !selectedRoleName) {
    return NextResponse.json({ error: 'progression_step and selected_role_name are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audition_scene_progress')
    .upsert({
      audition_script_id: auditionId,
      audition_scene_id: sceneId,
      assigned_rehearser_user_id: detail.script.assigned_rehearser_user_id,
      selected_role_name: selectedRoleName,
      progression_step: progressionStep,
      is_complete: isComplete,
      completed_at: isComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'audition_script_id,audition_scene_id,assigned_rehearser_user_id,selected_role_name,progression_step',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

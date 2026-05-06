import {
  canAccessAuditionScript,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const detail = await getAuditionDetail(auditionId);
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canAccessAuditionScript(viewer, detail.script)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!viewer.profile.is_admin && detail.script.assigned_rehearser_user_id !== viewer.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const roleId = String(body.audition_role_id ?? '').trim();
  if (!roleId) {
    return NextResponse.json({ error: 'audition_role_id is required' }, { status: 400 });
  }

  const role = detail.scenes.flatMap((scene) => scene.roles).find((item) => item.id === roleId);
  if (!role) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audition_target_roles')
    .upsert({
      audition_script_id: auditionId,
      assigned_rehearser_user_id: detail.script.assigned_rehearser_user_id,
      audition_role_id: role.id,
      selected_role_name: role.name,
      selected_at: new Date().toISOString(),
    }, {
      onConflict: 'audition_script_id,assigned_rehearser_user_id',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

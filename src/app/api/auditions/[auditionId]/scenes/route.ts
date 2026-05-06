import {
  canManageAuditionScript,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();

  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const label = String(body.label ?? '').trim();
  const sceneText = String(body.scene_text ?? '').trim();
  const sourcePageRef = String(body.source_page_ref ?? '').trim();
  const roleNames = Array.isArray(body.roles)
    ? body.roles.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];

  if (!label || !sceneText) {
    return NextResponse.json({ error: 'Scene label and text are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existingScenes } = await admin
    .from('audition_scenes')
    .select('id')
    .eq('audition_script_id', auditionId);

  const nextOrder = (existingScenes?.length ?? 0) + 1;
  const { data: scene, error } = await admin
    .from('audition_scenes')
    .insert({
      audition_script_id: auditionId,
      label,
      scene_text: sceneText,
      source_page_ref: sourcePageRef || null,
      order_index: nextOrder,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (roleNames.length > 0) {
    const roleRows = roleNames.map((name: string, index: number) => ({
      audition_scene_id: scene.id,
      name,
      order_index: index + 1,
      is_active: true,
    }));
    await admin.from('audition_roles').insert(roleRows);
  }

  return NextResponse.json(scene, { status: 201 });
}

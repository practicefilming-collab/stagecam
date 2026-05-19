import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ auditionId: string; sceneId: string }> },
) {
  const { auditionId, sceneId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.label === 'string') updates.label = body.label.trim();
  if (typeof body.scene_text === 'string') updates.scene_text = body.scene_text.trim();
  if (body.source_page_ref !== undefined) updates.source_page_ref = String(body.source_page_ref || '').trim() || null;
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (body.processing_metadata && typeof body.processing_metadata === 'object') {
    updates.processing_metadata = body.processing_metadata;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audition_scenes')
    .update(updates)
    .eq('id', sceneId)
    .eq('audition_script_id', auditionId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

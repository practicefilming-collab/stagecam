import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
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
  const sceneIds = Array.isArray(body.scene_ids)
    ? body.scene_ids.map((item: unknown) => String(item))
    : [];
  if (sceneIds.length === 0) {
    return NextResponse.json({ error: 'scene_ids is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  await Promise.all(
    sceneIds.map((sceneId: string, index: number) =>
      admin
        .from('audition_scenes')
        .update({ order_index: index + 1 })
        .eq('id', sceneId)
        .eq('audition_script_id', auditionId),
    ),
  );

  return NextResponse.json({ success: true });
}

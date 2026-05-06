import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string; sceneId: string }> },
) {
  const { sceneId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const roleNames = Array.isArray(body.roles)
    ? body.roles.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  const admin = createAdminClient();

  await admin.from('audition_roles').delete().eq('audition_scene_id', sceneId);

  if (roleNames.length === 0) {
    return NextResponse.json([]);
  }

  const { data, error } = await admin
    .from('audition_roles')
    .insert(
      roleNames.map((name: string, index: number) => ({
        audition_scene_id: sceneId,
        name,
        order_index: index + 1,
      })),
    )
    .select('*');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

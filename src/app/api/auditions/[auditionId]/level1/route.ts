import { NextResponse } from 'next/server';
import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import { generateAuditionLevel1Audio } from '@/lib/auditions/level1-audio';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: audition, error } = await admin
    .from('audition_scripts')
    .select('*')
    .eq('id', auditionId)
    .single();

  if (error || !audition) {
    return NextResponse.json({ error: error?.message ?? 'Audition not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({} as { sceneId?: string; regenerate?: boolean }));

  try {
    const result = await generateAuditionLevel1Audio({
      admin,
      audition,
      sceneId: typeof body.sceneId === 'string' ? body.sceneId : null,
      regenerate: body.regenerate === true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (generationError) {
    return NextResponse.json(
      { error: generationError instanceof Error ? generationError.message : 'Level 1 generation failed' },
      { status: 500 },
    );
  }
}

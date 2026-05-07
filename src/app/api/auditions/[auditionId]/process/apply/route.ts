import { NextResponse } from 'next/server';
import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import {
  applyAuditionProcessingPreview,
  buildAuditionProcessingPreview,
  ensureAuditionAiProfiles,
  sanitizeAuditionProcessingPreview,
  type AuditionProcessingPreview,
} from '@/lib/auditions/processing';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: script, error } = await admin
    .from('audition_scripts')
    .select('*')
    .eq('id', auditionId)
    .single();

  if (error || !script) {
    return NextResponse.json({ error: error?.message ?? 'Audition not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({} as { preview?: AuditionProcessingPreview }));

  try {
    const preview = sanitizeAuditionProcessingPreview(
      body.preview ?? await buildAuditionProcessingPreview({ admin, script }),
    );
    const result = await applyAuditionProcessingPreview({
      admin,
      audition: script,
      preview,
      processorUserId: viewer.userId,
    });

    await ensureAuditionAiProfiles({
      admin,
      scriptId: result.linkedScript.id,
      roleBriefs: preview.roleBriefs,
    });

    return NextResponse.json({
      ok: true,
      linkedScript: {
        id: result.linkedScript.id,
        title: result.linkedScript.title,
        slug: result.linkedScript.slug,
      },
    });
  } catch (applyError) {
    return NextResponse.json(
      { error: applyError instanceof Error ? applyError.message : 'Apply failed' },
      { status: 500 },
    );
  }
}

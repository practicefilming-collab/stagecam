import { NextResponse } from 'next/server';
import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import { buildAuditionProcessingPreview } from '@/lib/auditions/processing';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
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

  try {
    const preview = await buildAuditionProcessingPreview({
      admin,
      script,
    });

    return NextResponse.json(preview);
  } catch (previewError) {
    return NextResponse.json(
      { error: previewError instanceof Error ? previewError.message : 'Preview failed' },
      { status: 500 },
    );
  }
}

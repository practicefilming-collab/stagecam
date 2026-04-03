import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { runPipeline } from '@/lib/clips/pipeline/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for download + extract + analyze

/**
 * POST: Trigger or retry the clip processing pipeline.
 * Kicks off the full pipeline (download → extract → analyze) inline.
 * Admin-only. Pipeline status is tracked in the clips table.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get current clip state
  const { data: clip, error: fetchError } = await supabase
    .from('clips')
    .select('id, source_url, pipeline_status')
    .eq('id', clipId)
    .single();

  if (fetchError || !clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action ?? 'start';

  // Validate state transitions
  if (action === 'start' && clip.pipeline_status !== 'pending') {
    return NextResponse.json({ error: 'Pipeline can only be started from pending status' }, { status: 400 });
  }

  if (action === 'retry' && clip.pipeline_status !== 'failed') {
    return NextResponse.json({ error: 'Can only retry failed pipelines' }, { status: 400 });
  }

  // Reset pipeline error before starting
  await supabase
    .from('clips')
    .update({
      pipeline_status: 'downloading',
      pipeline_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId);

  // Run pipeline — this is async but we don't await it so the response returns immediately.
  // The pipeline updates the clip's pipeline_status as it progresses.
  // The admin UI polls the clip detail to see status changes.
  runPipeline(clipId).catch((err) => {
    console.error(`Pipeline failed for clip ${clipId}:`, err);
  });

  return NextResponse.json({ status: 'started', clipId });
}

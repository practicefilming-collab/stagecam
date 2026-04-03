import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

/**
 * POST: Trigger or retry the clip processing pipeline via the Fly.io worker.
 * The worker handles download, extraction, analysis, and segment creation.
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

  if (action === 'start' && clip.pipeline_status !== 'pending') {
    return NextResponse.json({ error: 'Pipeline can only be started from pending status' }, { status: 400 });
  }

  if (action === 'retry' && clip.pipeline_status !== 'failed') {
    return NextResponse.json({ error: 'Can only retry failed pipelines' }, { status: 400 });
  }

  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerToken = process.env.CLIP_WORKER_TOKEN;

  if (!workerUrl) {
    return NextResponse.json({ error: 'Clip worker not configured — set CLIP_WORKER_URL' }, { status: 503 });
  }

  // Reset status
  await supabase
    .from('clips')
    .update({
      pipeline_status: 'downloading',
      pipeline_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId);

  // Call worker — it returns 202 immediately and processes in background
  try {
    await fetch(`${workerUrl}/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerToken ? { 'x-worker-token': workerToken } : {}),
      },
      body: JSON.stringify({ clipId }),
    });
  } catch (err) {
    await supabase
      .from('clips')
      .update({
        pipeline_status: 'failed',
        pipeline_error: `Worker unreachable: ${(err as Error).message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId);

    return NextResponse.json({ error: 'Worker unreachable' }, { status: 503 });
  }

  return NextResponse.json({ status: 'started', clipId });
}

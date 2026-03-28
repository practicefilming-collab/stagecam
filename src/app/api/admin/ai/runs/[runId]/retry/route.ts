import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { recalculateGenerationRun } from '@/lib/generation/jobs';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function kickoffProcessing(request: Request, runId: string) {
  const processUrl = new URL('/api/admin/ai/process', request.url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const workerToken = process.env.AI_GENERATION_WORKER_TOKEN ?? process.env.EXPORT_WORKER_TOKEN;
  if (workerToken) {
    headers['x-ai-generation-worker-token'] = workerToken;
  }

  void fetch(processUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ runId }),
  }).catch(() => {
    // Best-effort trigger; queued jobs remain visible for manual retry.
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { runId } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const regenerateExisting = body.regenerateExisting === true;
  const retryFailedOnly = body.retryFailedOnly !== false;
  const admin = createAdminClient();

  const { data: existingRun, error } = await admin
    .from('script_generation_runs')
    .select('id')
    .eq('id', runId)
    .single();

  if (error || !existingRun) {
    return NextResponse.json({ error: error?.message ?? 'Run not found' }, { status: 404 });
  }

  let query = admin
    .from('scene_generation_jobs')
    .update({
      status: 'queued',
      progress_pct: 0,
      regenerate_existing: regenerateExisting,
      error_message: null,
      finished_at: null,
    })
    .eq('run_id', runId);

  if (retryFailedOnly) {
    query = query.eq('status', 'failed');
  } else {
    query = query.in('status', ['failed', 'succeeded', 'cancelled']);
  }

  const { data: updatedJobs, error: updateError } = await query.select('id');

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const requeuedCount = (updatedJobs ?? []).length;
  if (requeuedCount === 0) {
    return NextResponse.json({ error: 'No scene jobs were eligible for retry.' }, { status: 400 });
  }

  await admin
    .from('script_generation_runs')
    .update({
      status: 'queued',
      error_message: null,
      finished_at: null,
      retry_policy: {
        retryFailedOnly,
        regenerateExisting,
        retriedAt: new Date().toISOString(),
      },
    })
    .eq('id', runId);

  await recalculateGenerationRun(admin, runId);
  await kickoffProcessing(request, runId);

  return NextResponse.json({
    runId,
    status: 'queued',
    retryFailedOnly,
    regenerateExisting,
    requeuedCount,
  }, { status: 202 });
}

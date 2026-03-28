import { NextResponse } from 'next/server';
import { executeSceneGenerationJob } from '@/lib/generation/execute';
import { recalculateGenerationRun } from '@/lib/generation/jobs';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function kickoffNext(request: Request, runId: string) {
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
    // Best-effort drain; jobs remain queued and visible for retry.
  });
}

export async function POST(request: Request) {
  const workerToken = process.env.AI_GENERATION_WORKER_TOKEN ?? process.env.EXPORT_WORKER_TOKEN;
  const incomingToken = request.headers.get('x-ai-generation-worker-token');
  if (workerToken && incomingToken !== workerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId, runId } = await request.json().catch(() => ({} as { jobId?: string; runId?: string }));
  const admin = createAdminClient();

  let requestedJob:
    | {
        id: string;
        run_id: string;
        attempt_count: number;
        status: string;
      }
    | null = null;

  if (jobId) {
    const { data } = await admin
      .from('scene_generation_jobs')
      .select('id, run_id, attempt_count, status')
      .eq('id', jobId)
      .single();
    requestedJob = data;
  } else {
    let query = admin
      .from('scene_generation_jobs')
      .select('id, run_id, attempt_count, status')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);

    if (runId) {
      query = query.eq('run_id', runId);
    }

    const { data } = await query.maybeSingle();
    requestedJob = data;
  }

  if (!requestedJob) {
    return NextResponse.json({ status: 'idle' });
  }

  if (requestedJob.status === 'succeeded') {
    return NextResponse.json({ status: 'succeeded', jobId: requestedJob.id });
  }

  const { data: claimed, error: claimError } = await admin
    .from('scene_generation_jobs')
    .update({
      status: 'processing',
      progress_pct: 1,
      started_at: new Date().toISOString(),
      finished_at: null,
      error_message: null,
      attempt_count: (requestedJob.attempt_count ?? 0) + 1,
    })
    .eq('id', requestedJob.id)
    .in('status', ['queued', 'failed'])
    .select('id, run_id')
    .single();

  if (claimError || !claimed) {
    return NextResponse.json({ status: requestedJob.status, jobId: requestedJob.id });
  }

  await recalculateGenerationRun(admin, claimed.run_id as string);

  try {
    const execution = await executeSceneGenerationJob({
      admin,
      jobId: claimed.id as string,
    });

    void kickoffNext(request, execution.run.id);

    return NextResponse.json({
      status: execution.job.status,
      jobId: execution.job.id,
      runId: execution.run.id,
      persistedLines: execution.job.persisted_lines,
      failedLines: execution.job.failed_lines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scene generation job failed';

    await admin
      .from('scene_generation_jobs')
      .update({
        status: 'failed',
        progress_pct: 100,
        error_message: message.slice(0, 900),
        finished_at: new Date().toISOString(),
      })
      .eq('id', claimed.id);

    await recalculateGenerationRun(admin, claimed.run_id as string);
    void kickoffNext(request, claimed.run_id as string);

    return NextResponse.json(
      { status: 'failed', jobId: claimed.id, runId: claimed.run_id, error: message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { executeSceneGenerationJob } from '@/lib/generation/execute';
import { recalculateGenerationRun } from '@/lib/generation/jobs';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;
const MAX_BATCH_JOBS = 5;
const BATCH_TIME_BUDGET_MS = 240_000;

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

async function loadRequestedJob(input: {
  admin: ReturnType<typeof createAdminClient>;
  jobId?: string;
  runId?: string;
}) {
  if (input.jobId) {
    const { data } = await input.admin
      .from('scene_generation_jobs')
      .select('id, run_id, attempt_count, status')
      .eq('id', input.jobId)
      .single();
    return data;
  }

  let query = input.admin
    .from('scene_generation_jobs')
    .select('id, run_id, attempt_count, status')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (input.runId) {
    query = query.eq('run_id', input.runId);
  }

  const { data } = await query.maybeSingle();
  return data;
}

async function claimQueuedJob(input: {
  admin: ReturnType<typeof createAdminClient>;
  requestedJob: {
    id: string;
    run_id: string;
    attempt_count: number;
    status: string;
  };
}) {
  const { data: claimed, error: claimError } = await input.admin
    .from('scene_generation_jobs')
    .update({
      status: 'processing',
      progress_pct: 1,
      started_at: new Date().toISOString(),
      finished_at: null,
      error_message: null,
      attempt_count: (input.requestedJob.attempt_count ?? 0) + 1,
    })
    .eq('id', input.requestedJob.id)
    .in('status', ['queued', 'failed'])
    .select('id, run_id')
    .single();

  return {
    claimed,
    claimError,
  };
}

export async function POST(request: Request) {
  const workerToken = process.env.AI_GENERATION_WORKER_TOKEN ?? process.env.EXPORT_WORKER_TOKEN;
  const incomingToken = request.headers.get('x-ai-generation-worker-token');
  if (workerToken && incomingToken !== workerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId, runId } = await request.json().catch(() => ({} as { jobId?: string; runId?: string }));
  const admin = createAdminClient();
  const startedAt = Date.now();
  let requestedJob = await loadRequestedJob({ admin, jobId, runId });

  if (!requestedJob) {
    return NextResponse.json({ status: 'idle' });
  }

  if (requestedJob.status === 'succeeded') {
    return NextResponse.json({ status: 'succeeded', jobId: requestedJob.id });
  }

  const scopedRunId = runId ?? requestedJob.run_id;
  let jobsProcessed = 0;
  let jobsSucceeded = 0;
  let jobsFailed = 0;
  let lastClaimedJobId: string | null = null;

  while (requestedJob && jobsProcessed < MAX_BATCH_JOBS && Date.now() - startedAt < BATCH_TIME_BUDGET_MS) {
    const { claimed, claimError } = await claimQueuedJob({
      admin,
      requestedJob,
    });

    if (claimError || !claimed) {
      requestedJob = await loadRequestedJob({ admin, runId: scopedRunId });
      continue;
    }

    lastClaimedJobId = claimed.id as string;
    await recalculateGenerationRun(admin, claimed.run_id as string);

    try {
      const execution = await executeSceneGenerationJob({
        admin,
        jobId: claimed.id as string,
      });

      jobsProcessed += 1;
      if (execution.job.status === 'succeeded') {
        jobsSucceeded += 1;
      } else {
        jobsFailed += 1;
      }
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
      jobsProcessed += 1;
      jobsFailed += 1;
    }

    requestedJob = await loadRequestedJob({ admin, runId: scopedRunId });
  }

  const { count: jobsRemaining } = await admin
    .from('scene_generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', scopedRunId)
    .eq('status', 'queued');

  if ((jobsRemaining ?? 0) > 0) {
    void kickoffNext(request, scopedRunId);
  }

  return NextResponse.json({
    status: jobsProcessed > 0 ? 'processing' : 'idle',
    jobId: lastClaimedJobId,
    runId: scopedRunId,
    jobsProcessed,
    jobsSucceeded,
    jobsFailed,
    jobsRemaining: jobsRemaining ?? 0,
  });
}

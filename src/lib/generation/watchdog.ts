import type { SupabaseClient } from '@supabase/supabase-js';
import { recalculateGenerationRun } from './jobs';

const IDLE_RESTART_THRESHOLD_MS = 2 * 60 * 1000;
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;
const WATCHDOG_COOLDOWN_MS = 2 * 60 * 1000;

type SceneGenerationJobWatchdogRow = {
  id: string;
  run_id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  progress_pct: number;
  persisted_lines: number;
  failed_lines: number;
  total_lines: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

type ScriptGenerationRunWatchdogRow = {
  id: string;
  status: string;
  retry_policy: Record<string, unknown> | null;
};

type RunRecoverySummary = {
  runId: string;
  queuedJobs: number;
  processingJobs: number;
  failedJobs: number;
  staleProcessingJobsRecovered: number;
  restartTriggered: boolean;
  skippedByCooldown: boolean;
  isIdleWithQueuedWork: boolean;
};

type WatchdogResult = {
  scannedRuns: number;
  recoveredJobs: number;
  restartedRuns: number;
  runs: RunRecoverySummary[];
};

function isOlderThan(iso: string | null | undefined, thresholdMs: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time > thresholdMs;
}

function extractLastKickoffAt(retryPolicy: Record<string, unknown> | null): string | null {
  if (!retryPolicy || typeof retryPolicy !== 'object') return null;
  const watchdog = retryPolicy.watchdog;
  if (!watchdog || typeof watchdog !== 'object') return null;
  const lastKickoffAt = (watchdog as Record<string, unknown>).lastKickoffAt;
  return typeof lastKickoffAt === 'string' ? lastKickoffAt : null;
}

async function triggerProcessing(baseUrl: string, runId: string): Promise<void> {
  const processUrl = new URL('/api/admin/ai/process', baseUrl);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const workerToken = process.env.AI_GENERATION_WORKER_TOKEN ?? process.env.EXPORT_WORKER_TOKEN;
  if (workerToken) {
    headers['x-ai-generation-worker-token'] = workerToken;
  }

  await fetch(processUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ runId }),
  }).catch(() => {
    // Best-effort trigger; the watchdog will retry on the next pass.
  });
}

async function stampWatchdogAttempt(
  admin: SupabaseClient,
  run: ScriptGenerationRunWatchdogRow,
  payload: Record<string, unknown>
) {
  const retryPolicy = (run.retry_policy && typeof run.retry_policy === 'object')
    ? run.retry_policy
    : {};
  const watchdog = (retryPolicy.watchdog && typeof retryPolicy.watchdog === 'object')
    ? retryPolicy.watchdog as Record<string, unknown>
    : {};

  await admin
    .from('script_generation_runs')
    .update({
      retry_policy: {
        ...retryPolicy,
        watchdog: {
          ...watchdog,
          ...payload,
        },
      },
    })
    .eq('id', run.id);
}

export async function runAiGenerationWatchdog(input: {
  admin: SupabaseClient;
  baseUrl: string;
  runId?: string | null;
}): Promise<WatchdogResult> {
  const runQuery = input.admin
    .from('script_generation_runs')
    .select('id, status, retry_policy')
    .in('status', ['queued', 'processing', 'failed']);

  const { data: runs, error: runError } = input.runId
    ? await runQuery.eq('id', input.runId)
    : await runQuery.order('created_at', { ascending: false }).limit(24);

  if (runError) {
    throw new Error(`Failed to load AI generation runs for watchdog: ${runError.message}`);
  }

  const runRows = (runs ?? []) as ScriptGenerationRunWatchdogRow[];
  if (runRows.length === 0) {
    return {
      scannedRuns: 0,
      recoveredJobs: 0,
      restartedRuns: 0,
      runs: [],
    };
  }

  const runIds = runRows.map((run) => run.id);
  const { data: jobs, error: jobsError } = await input.admin
    .from('scene_generation_jobs')
    .select('id, run_id, status, progress_pct, persisted_lines, failed_lines, total_lines, error_message, started_at, finished_at, updated_at')
    .in('run_id', runIds)
    .in('status', ['queued', 'processing', 'failed']);

  if (jobsError) {
    throw new Error(`Failed to load AI scene jobs for watchdog: ${jobsError.message}`);
  }

  const jobsByRun = new Map<string, SceneGenerationJobWatchdogRow[]>();
  for (const job of (jobs ?? []) as SceneGenerationJobWatchdogRow[]) {
    const list = jobsByRun.get(job.run_id) ?? [];
    list.push(job);
    jobsByRun.set(job.run_id, list);
  }

  let recoveredJobs = 0;
  let restartedRuns = 0;
  const runSummaries: RunRecoverySummary[] = [];

  for (const run of runRows) {
    const runJobs = jobsByRun.get(run.id) ?? [];
    if (runJobs.length === 0) {
      runSummaries.push({
        runId: run.id,
        queuedJobs: 0,
        processingJobs: 0,
        failedJobs: 0,
        staleProcessingJobsRecovered: 0,
        restartTriggered: false,
        skippedByCooldown: false,
        isIdleWithQueuedWork: false,
      });
      continue;
    }

    const staleProcessingJobs = runJobs.filter(
      (job) => job.status === 'processing' && isOlderThan(job.updated_at, STALE_PROCESSING_THRESHOLD_MS)
    );

    if (staleProcessingJobs.length > 0) {
      recoveredJobs += staleProcessingJobs.length;
      await input.admin
        .from('scene_generation_jobs')
        .update({
          status: 'queued',
          started_at: null,
          finished_at: null,
          error_message: 'Watchdog recovered stale processing job after inactivity.',
        })
        .in('id', staleProcessingJobs.map((job) => job.id));

      await stampWatchdogAttempt(input.admin, run, {
        lastRecoveredAt: new Date().toISOString(),
        recoveredJobIds: staleProcessingJobs.map((job) => job.id),
      });
    }

    await recalculateGenerationRun(input.admin, run.id);

    const refreshedRunJobs = [
      ...runJobs.filter((job) => job.status !== 'processing'),
      ...staleProcessingJobs.map((job) => ({
        ...job,
        status: 'queued' as const,
        started_at: null,
        finished_at: null,
        error_message: 'Watchdog recovered stale processing job after inactivity.',
      })),
    ];
    const queuedJobs = refreshedRunJobs.filter((job) => job.status === 'queued').length;
    const processingJobs = refreshedRunJobs.filter((job) => job.status === 'processing').length;
    const failedJobs = refreshedRunJobs.filter((job) => job.status === 'failed').length;
    const isIdleWithQueuedWork = queuedJobs > 0 && processingJobs === 0;
    const lastKickoffAt = extractLastKickoffAt(run.retry_policy);
    const inCooldown = isOlderThan(lastKickoffAt, WATCHDOG_COOLDOWN_MS) === false && Boolean(lastKickoffAt);

    const idleLongEnough = runJobs.some((job) => job.status === 'queued' && isOlderThan(job.updated_at, IDLE_RESTART_THRESHOLD_MS));

    let restartTriggered = false;
    let skippedByCooldown = false;

    if (isIdleWithQueuedWork && (staleProcessingJobs.length > 0 || idleLongEnough)) {
      if (inCooldown) {
        skippedByCooldown = true;
      } else {
        await stampWatchdogAttempt(input.admin, run, {
          lastKickoffAt: new Date().toISOString(),
        });
        await triggerProcessing(input.baseUrl, run.id);
        restartedRuns += 1;
        restartTriggered = true;
      }
    }

    runSummaries.push({
      runId: run.id,
      queuedJobs,
      processingJobs,
      failedJobs,
      staleProcessingJobsRecovered: staleProcessingJobs.length,
      restartTriggered,
      skippedByCooldown,
      isIdleWithQueuedWork,
    });
  }

  return {
    scannedRuns: runRows.length,
    recoveredJobs,
    restartedRuns,
    runs: runSummaries,
  };
}

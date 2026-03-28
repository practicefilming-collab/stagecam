import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerationSourceLine } from './types';
import type { SceneGenerationJobStatus, ScriptGenerationRunStatus } from '@/lib/types';

type SceneJobSeed = {
  sceneId: string;
  totalLines: number;
};

type SceneGenerationJobRow = {
  id: string;
  status: SceneGenerationJobStatus;
  total_lines: number;
  persisted_lines: number;
  failed_lines: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
};

function maxStatus(statuses: SceneGenerationJobStatus[]): ScriptGenerationRunStatus {
  const queued = statuses.includes('queued');
  const processing = statuses.includes('processing');
  const failed = statuses.includes('failed');

  if (processing) return 'processing';
  if (queued && statuses.some((status) => status !== 'queued')) return 'processing';
  if (queued) return 'queued';
  if (failed) return 'failed';
  if (statuses.length > 0) return 'succeeded';
  return 'queued';
}

export function buildSceneJobSeeds(sourceLines: GenerationSourceLine[]): SceneJobSeed[] {
  const sceneMap = new Map<string, number>();

  for (const line of sourceLines) {
    if (line.isSystem) continue;
    sceneMap.set(line.sceneId, (sceneMap.get(line.sceneId) ?? 0) + 1);
  }

  return [...sceneMap.entries()]
    .map(([sceneId, totalLines]) => ({ sceneId, totalLines }))
    .filter((seed) => seed.totalLines > 0);
}

export async function enqueueSceneGenerationJobs(input: {
  admin: SupabaseClient;
  runId: string;
  scriptId: string;
  aiProfileIds: string[];
  sceneSeeds: SceneJobSeed[];
  regenerateExisting: boolean;
}): Promise<{ totalLines: number; jobsCreated: number }> {
  const rows = input.aiProfileIds.flatMap((aiProfileId) =>
    input.sceneSeeds.map((seed) => ({
      run_id: input.runId,
      script_id: input.scriptId,
      scene_id: seed.sceneId,
      ai_profile_id: aiProfileId,
      status: 'queued',
      progress_pct: 0,
      regenerate_existing: input.regenerateExisting,
      total_lines: seed.totalLines,
      persisted_lines: 0,
      failed_lines: 0,
      attempt_count: 0,
      error_message: null,
    }))
  );

  if (rows.length === 0) {
    return { totalLines: 0, jobsCreated: 0 };
  }

  const { error } = await input.admin
    .from('scene_generation_jobs')
    .insert(rows);

  if (error) {
    throw new Error(`Failed to enqueue AI scene jobs: ${error.message}`);
  }

  return {
    totalLines: rows.reduce((sum, row) => sum + row.total_lines, 0),
    jobsCreated: rows.length,
  };
}

export async function recalculateGenerationRun(
  admin: SupabaseClient,
  runId: string
): Promise<{
  status: ScriptGenerationRunStatus;
  totalLines: number;
  persistedLines: number;
  failedLines: number;
}> {
  const { data, error } = await admin
    .from('scene_generation_jobs')
    .select('id, status, total_lines, persisted_lines, failed_lines, error_message, started_at, finished_at')
    .eq('run_id', runId);

  if (error) {
    throw new Error(`Failed to load scene generation jobs: ${error.message}`);
  }

  const jobs = (data ?? []) as SceneGenerationJobRow[];
  const status = maxStatus(jobs.map((job) => job.status));
  const totalLines = jobs.reduce((sum, job) => sum + (job.total_lines ?? 0), 0);
  const persistedLines = jobs.reduce((sum, job) => sum + (job.persisted_lines ?? 0), 0);
  const failedLines = jobs.reduce((sum, job) => sum + (job.failed_lines ?? 0), 0);
  const startedAtCandidates = jobs
    .map((job) => job.started_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  const finishedAtCandidates = jobs
    .map((job) => job.finished_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  const nextStatus =
    jobs.length === 0
      ? 'queued'
      : jobs.every((job) => job.status === 'succeeded')
        ? 'succeeded'
        : status;
  const errorMessage =
    nextStatus === 'failed'
      ? jobs.find((job) => job.status === 'failed')?.error_message ?? 'One or more scene jobs failed'
      : null;
  const finishedAt =
    jobs.length > 0 && jobs.every((job) => ['succeeded', 'failed', 'cancelled'].includes(job.status))
      ? finishedAtCandidates.at(-1) ?? new Date().toISOString()
      : null;

  const { error: updateError } = await admin
    .from('script_generation_runs')
    .update({
      status: nextStatus,
      total_lines: totalLines,
      persisted_lines: persistedLines,
      failed_lines: failedLines,
      error_message: errorMessage,
      started_at: startedAtCandidates[0] ?? null,
      finished_at: finishedAt,
    })
    .eq('id', runId);

  if (updateError) {
    throw new Error(`Failed to update generation run: ${updateError.message}`);
  }

  return {
    status: nextStatus,
    totalLines,
    persistedLines,
    failedLines,
  };
}

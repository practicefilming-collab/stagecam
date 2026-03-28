import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { buildSceneJobSeeds, enqueueSceneGenerationJobs } from '@/lib/generation/jobs';
import { loadGenerationSourceLines } from '@/lib/generation/source';
import { listAiProfiles } from '@/lib/generation/execute';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await isAdmin(supabase))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}

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
    // Best-effort trigger; queued jobs remain retryable.
  });
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data: runs, error } = await admin
    .from('script_generation_runs')
    .select(`
      id,
      script_id,
      ai_profile_ids,
      status,
      execution_mode,
      total_lines,
      persisted_lines,
      failed_lines,
      error_message,
      started_at,
      finished_at,
      created_at,
      scripts(title, year)
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const runIds = (runs ?? []).map((run) => run.id as string);
  const profileIds = [...new Set((runs ?? []).flatMap((run) => (run.ai_profile_ids as string[]) ?? []))];

  const [{ data: profiles }, { data: failedRecords }, { data: sceneJobs }] = await Promise.all([
    profileIds.length > 0
      ? admin
          .from('ai_profiles')
          .select('id, display_name, voice_persona_id, voice_persona_label')
          .in('id', profileIds)
      : Promise.resolve({ data: [] }),
    runIds.length > 0
      ? admin
          .from('line_generation_records')
          .select('run_id, chunk_id, error_message, source_line_snapshot, chunks(character, chunk_in_scene, scenes(scene_number, scene_heading))')
          .in('run_id', runIds)
          .eq('status', 'failed')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    runIds.length > 0
      ? admin
          .from('scene_generation_jobs')
          .select('run_id, status')
          .in('run_id', runIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  const failedByRun = new Map<string, Array<Record<string, unknown>>>();
  const sceneJobCounts = new Map<string, Record<string, number>>();

  for (const row of (sceneJobs ?? []) as Array<Record<string, unknown>>) {
    const runId = row.run_id as string;
    const status = row.status as string;
    const counts = sceneJobCounts.get(runId) ?? { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0 };
    counts[status] = (counts[status] ?? 0) + 1;
    sceneJobCounts.set(runId, counts);
  }

  for (const row of (failedRecords ?? []) as Array<Record<string, unknown>>) {
    const runId = row.run_id as string;
    const list = failedByRun.get(runId) ?? [];
    if (list.length < 8) list.push(row);
    failedByRun.set(runId, list);
  }

  const payload = (runs ?? []).map((run) => ({
    id: run.id,
    scriptId: run.script_id,
    scriptTitle: (run.scripts as { title?: string } | null)?.title ?? 'Unknown script',
    scriptYear: (run.scripts as { year?: number | null } | null)?.year ?? null,
    status: run.status,
    executionMode: run.execution_mode,
    totalLines: run.total_lines,
    persistedLines: run.persisted_lines,
    failedLines: run.failed_lines,
    errorMessage: run.error_message,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    createdAt: run.created_at,
    sceneJobCounts: sceneJobCounts.get(run.id as string) ?? { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0 },
    profiles: ((run.ai_profile_ids as string[]) ?? []).map((id) => {
      const profile = profileMap.get(id);
      return {
        id,
        displayName: (profile?.display_name as string | undefined) ?? 'Unknown voice',
        voicePersonaId: (profile?.voice_persona_id as string | undefined) ?? null,
        voicePersonaLabel: (profile?.voice_persona_label as string | undefined) ?? null,
      };
    }),
    failedEntries: (failedByRun.get(run.id as string) ?? []).map((entry) => {
      const chunk = entry.chunks as {
        character?: string | null;
        chunk_in_scene?: number;
        scenes?: { scene_number?: number; scene_heading?: string | null };
      } | null;
      return {
        chunkId: entry.chunk_id,
        character: chunk?.character ?? null,
        chunkInScene: chunk?.chunk_in_scene ?? null,
        sceneNumber: chunk?.scenes?.scene_number ?? null,
        sceneHeading: chunk?.scenes?.scene_heading ?? null,
        sourceLine: entry.source_line_snapshot,
        errorMessage: entry.error_message,
      };
    }),
  }));

  return NextResponse.json({ runs: payload });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const scriptId = typeof body.scriptId === 'string' ? body.scriptId : '';
  const aiProfileIds = Array.isArray(body.aiProfileIds)
    ? body.aiProfileIds.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  const regenerateExisting = body.regenerateExisting === true;

  if (!scriptId || aiProfileIds.length === 0) {
    return NextResponse.json({ error: 'scriptId and at least one aiProfileId are required.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const profiles = await listAiProfiles(admin, scriptId, aiProfileIds);
  if (profiles.length !== aiProfileIds.length) {
    return NextResponse.json({ error: 'One or more AI profiles were not found for this script.' }, { status: 400 });
  }

  const sourceLines = await loadGenerationSourceLines(admin, scriptId);
  const sceneSeeds = buildSceneJobSeeds(sourceLines);
  if (sceneSeeds.length === 0) {
    return NextResponse.json({ error: 'No rehearsable lines found for this script.' }, { status: 400 });
  }

  const runId = randomUUID();
  const { error: insertError } = await admin
    .from('script_generation_runs')
    .insert({
      id: runId,
      script_id: scriptId,
      ai_profile_ids: aiProfileIds,
      status: 'queued',
      execution_mode: 'offline_batch',
      character_map: {},
      provider_config: {
        provider: 'xAI',
        mode: 'tts',
        queueMode: 'scene_jobs',
      },
      retry_policy: {
        regenerateExisting,
        retryFailedOnly: true,
      },
      total_lines: sceneSeeds.reduce((sum, seed) => sum + seed.totalLines, 0) * aiProfileIds.length,
      persisted_lines: 0,
      failed_lines: 0,
      error_message: null,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const { totalLines, jobsCreated } = await enqueueSceneGenerationJobs({
      admin,
      runId,
      scriptId,
      aiProfileIds,
      sceneSeeds,
      regenerateExisting,
    });

    await admin
      .from('script_generation_runs')
      .update({ total_lines: totalLines })
      .eq('id', runId);

    await kickoffProcessing(request, runId);

    return NextResponse.json({
      runId,
      status: 'queued',
      totalLines,
      jobsCreated,
      sceneCount: sceneSeeds.length,
      profileCount: aiProfileIds.length,
    }, { status: 202 });
  } catch (error) {
    await admin
      .from('script_generation_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Failed to enqueue generation jobs',
      })
      .eq('id', runId);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enqueue generation jobs', runId },
      { status: 500 }
    );
  }
}

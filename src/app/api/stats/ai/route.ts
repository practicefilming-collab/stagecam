import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { runAiGenerationWatchdog } from '@/lib/generation/watchdog';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  await runAiGenerationWatchdog({
    admin,
    baseUrl: request.url,
  });

  const [{ data: profiles }, { data: runs }, { count: recordingCount }] = await Promise.all([
    admin
      .from('ai_profiles')
      .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, created_at, scripts(title, year)')
      .order('created_at', { ascending: false }),
    admin
      .from('script_generation_runs')
      .select('id, script_id, ai_profile_ids, status, total_lines, persisted_lines, failed_lines, started_at, finished_at, created_at, scripts(title, year)')
      .order('created_at', { ascending: false })
      .limit(12),
    admin
      .from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('recording_source', 'ai_generated'),
  ]);

  const runIds = (runs ?? []).map((run) => run.id as string);
  const profileIds = (profiles ?? []).map((profile) => profile.id as string);

  const [{ data: lineRecords }, { data: aiRecordings }, { data: sceneJobs }] = await Promise.all([
    runIds.length > 0
      ? admin
          .from('line_generation_records')
          .select('run_id, ai_profile_id, status, synthesis_response_payload, error_message, source_line_snapshot, chunks(character, chunk_in_scene, scenes(scene_number, scene_heading))')
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? admin
          .from('recordings')
          .select('ai_profile_id, size_bytes')
          .eq('recording_source', 'ai_generated')
          .in('ai_profile_id', profileIds)
      : Promise.resolve({ data: [] }),
    runIds.length > 0
      ? admin
          .from('scene_generation_jobs')
          .select('run_id, status')
          .in('run_id', runIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileRecordingStats = new Map<string, { count: number; sizeBytes: number }>();
  for (const row of (aiRecordings ?? []) as Array<{ ai_profile_id: string | null; size_bytes: number | null }>) {
    if (!row.ai_profile_id) continue;
    const current = profileRecordingStats.get(row.ai_profile_id) ?? { count: 0, sizeBytes: 0 };
    current.count += 1;
    current.sizeBytes += row.size_bytes ?? 0;
    profileRecordingStats.set(row.ai_profile_id, current);
  }

  const failedByRun = new Map<string, Array<Record<string, unknown>>>();
  const skippedByRun = new Map<string, number>();
  const profilePersistedCounts = new Map<string, number>();
  const sceneJobCounts = new Map<string, { queued: number; processing: number; succeeded: number; failed: number; cancelled: number }>();

  for (const row of (sceneJobs ?? []) as Array<Record<string, unknown>>) {
    const runId = row.run_id as string;
    const status = row.status as 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
    const counts = sceneJobCounts.get(runId) ?? { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0 };
    counts[status] += 1;
    sceneJobCounts.set(runId, counts);
  }

  for (const row of (lineRecords ?? []) as Array<Record<string, unknown>>) {
    const runId = row.run_id as string;
    const aiProfileId = row.ai_profile_id as string;
    const synthesisPayload = (row.synthesis_response_payload as Record<string, unknown> | null) ?? {};

    if (row.status === 'persisted') {
      profilePersistedCounts.set(aiProfileId, (profilePersistedCounts.get(aiProfileId) ?? 0) + 1);
    }
    if (synthesisPayload.reusedExistingRecording === true) {
      skippedByRun.set(runId, (skippedByRun.get(runId) ?? 0) + 1);
    }
    if (row.status === 'failed') {
      const list = failedByRun.get(runId) ?? [];
      if (list.length < 6) list.push(row);
      failedByRun.set(runId, list);
    }
  }

  const profilePayload = (profiles ?? []).map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    status: profile.status,
    platform: profile.platform,
    voicePersonaId: profile.voice_persona_id,
    voicePersonaLabel: profile.voice_persona_label,
    createdAt: profile.created_at,
    scriptTitle: (profile.scripts as { title?: string } | null)?.title ?? 'Unknown script',
    scriptYear: (profile.scripts as { year?: number | null } | null)?.year ?? null,
    generatedRecordings: profileRecordingStats.get(profile.id as string)?.count ?? 0,
    generatedStorageBytes: profileRecordingStats.get(profile.id as string)?.sizeBytes ?? 0,
    persistedLineCount: profilePersistedCounts.get(profile.id as string) ?? 0,
  }));

  const runPayload = (runs ?? []).map((run) => ({
    sceneJobCounts: sceneJobCounts.get(run.id as string) ?? { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0 },
    id: run.id,
    scriptId: run.script_id,
    scriptTitle: (run.scripts as { title?: string } | null)?.title ?? 'Unknown script',
    scriptYear: (run.scripts as { year?: number | null } | null)?.year ?? null,
    status:
      (sceneJobCounts.get(run.id as string)?.processing ?? 0) > 0
        ? 'processing'
        : (sceneJobCounts.get(run.id as string)?.queued ?? 0) > 0
          ? 'queued'
          : (run.status as string),
    isIdleWithQueuedWork:
      (sceneJobCounts.get(run.id as string)?.queued ?? 0) > 0 &&
      (sceneJobCounts.get(run.id as string)?.processing ?? 0) === 0,
    totalLines: run.total_lines,
    persistedLines: run.persisted_lines,
    failedLines: run.failed_lines,
    skippedLines: skippedByRun.get(run.id as string) ?? 0,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    createdAt: run.created_at,
    failedEntries: (failedByRun.get(run.id as string) ?? []).map((entry) => {
      const chunk = entry.chunks as {
        character?: string | null;
        chunk_in_scene?: number;
        scenes?: { scene_number?: number; scene_heading?: string | null };
      } | null;
      return {
        character: chunk?.character ?? null,
        chunkInScene: chunk?.chunk_in_scene ?? null,
        sceneNumber: chunk?.scenes?.scene_number ?? null,
        sceneHeading: chunk?.scenes?.scene_heading ?? null,
        sourceLine: entry.source_line_snapshot,
        errorMessage: entry.error_message,
      };
    }),
  }));

  return NextResponse.json({
    totals: {
      totalProfiles: profilePayload.length,
      activeProfiles: profilePayload.filter((profile) => profile.status === 'active').length,
      totalRuns: (runs ?? []).length,
      totalGeneratedRecordings: recordingCount ?? 0,
      totalPersistedLines: runPayload.reduce((sum, run) => sum + run.persistedLines, 0),
      totalFailedLines: runPayload.reduce((sum, run) => sum + run.failedLines, 0),
      totalQueuedJobs: runPayload.reduce((sum, run) => sum + run.sceneJobCounts.queued, 0),
      totalProcessingJobs: runPayload.reduce((sum, run) => sum + run.sceneJobCounts.processing, 0),
    },
    profiles: profilePayload,
    runs: runPayload,
  });
}

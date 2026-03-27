import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { executeGenerationRun } from '@/lib/generation/execute';
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

  const [{ data: profiles }, { data: failedRecords }] = await Promise.all([
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
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  const failedByRun = new Map<string, Array<Record<string, unknown>>>();

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
      },
      retry_policy: {
        regenerateExisting,
      },
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const execution = await executeGenerationRun({
      admin,
      runId,
      scriptId,
      aiProfileIds,
      regenerateExisting,
    });

    return NextResponse.json({
      run: execution.run,
      profiles: execution.profiles,
      statusCounts: execution.statusCounts,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Generation run failed',
        runId,
      },
      { status: 500 }
    );
  }
}

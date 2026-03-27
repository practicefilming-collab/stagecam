import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(
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
  const admin = createAdminClient();

  const { data: run, error } = await admin
    .from('script_generation_runs')
    .select(`
      id,
      script_id,
      ai_profile_ids,
      status,
      execution_mode,
      provider_config,
      retry_policy,
      total_lines,
      persisted_lines,
      failed_lines,
      error_message,
      started_at,
      finished_at,
      created_at,
      updated_at,
      scripts(title, year)
    `)
    .eq('id', runId)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: error?.message ?? 'Run not found' }, { status: 404 });
  }

  const profileIds = (run.ai_profile_ids as string[]) ?? [];
  const [{ data: profiles }, { data: lineRecords }] = await Promise.all([
    profileIds.length > 0
      ? admin
          .from('ai_profiles')
          .select('id, display_name, voice_persona_id, voice_persona_label')
          .in('id', profileIds)
      : Promise.resolve({ data: [] }),
    admin
      .from('line_generation_records')
      .select(`
        id,
        ai_profile_id,
        chunk_id,
        status,
        source_line_snapshot,
        error_message,
        synthesis_response_payload,
        chunks(character, chunk_in_scene, scenes(scene_number, scene_heading))
      `)
      .eq('run_id', runId)
      .order('created_at', { ascending: false }),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  const failedEntries = [];
  const skippedEntries = [];

  for (const row of (lineRecords ?? []) as Array<Record<string, unknown>>) {
    const synthesisPayload = (row.synthesis_response_payload as Record<string, unknown> | null) ?? {};
    const chunk = row.chunks as {
      character?: string | null;
      chunk_in_scene?: number;
      scenes?: { scene_number?: number; scene_heading?: string | null };
    } | null;
    const entry = {
      id: row.id,
      chunkId: row.chunk_id,
      aiProfileId: row.ai_profile_id,
      aiProfileName: (profileMap.get(row.ai_profile_id as string)?.display_name as string | undefined) ?? 'Unknown voice',
      status: row.status,
      character: chunk?.character ?? null,
      chunkInScene: chunk?.chunk_in_scene ?? null,
      sceneNumber: chunk?.scenes?.scene_number ?? null,
      sceneHeading: chunk?.scenes?.scene_heading ?? null,
      sourceLine: row.source_line_snapshot,
      errorMessage: row.error_message,
    };

    if (row.status === 'failed') failedEntries.push(entry);
    if (synthesisPayload.reusedExistingRecording === true) skippedEntries.push(entry);
  }

  return NextResponse.json({
    run: {
      id: run.id,
      scriptId: run.script_id,
      scriptTitle: (run.scripts as { title?: string } | null)?.title ?? 'Unknown script',
      scriptYear: (run.scripts as { year?: number | null } | null)?.year ?? null,
      status: run.status,
      executionMode: run.execution_mode,
      providerConfig: run.provider_config,
      retryPolicy: run.retry_policy,
      totalLines: run.total_lines,
      persistedLines: run.persisted_lines,
      failedLines: run.failed_lines,
      errorMessage: run.error_message,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      profiles: profileIds.map((id) => {
        const profile = profileMap.get(id);
        return {
          id,
          displayName: (profile?.display_name as string | undefined) ?? 'Unknown voice',
          voicePersonaId: (profile?.voice_persona_id as string | undefined) ?? null,
          voicePersonaLabel: (profile?.voice_persona_label as string | undefined) ?? null,
        };
      }),
    },
    failedEntries,
    skippedEntries,
  });
}

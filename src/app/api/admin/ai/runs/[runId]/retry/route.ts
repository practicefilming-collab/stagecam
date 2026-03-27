import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { executeGenerationRun } from '@/lib/generation/execute';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

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
  const admin = createAdminClient();

  const { data: existingRun, error } = await admin
    .from('script_generation_runs')
    .select('script_id, ai_profile_ids')
    .eq('id', runId)
    .single();

  if (error || !existingRun) {
    return NextResponse.json({ error: error?.message ?? 'Run not found' }, { status: 404 });
  }

  const nextRunId = randomUUID();
  const { error: insertError } = await admin
    .from('script_generation_runs')
    .insert({
      id: nextRunId,
      script_id: existingRun.script_id,
      ai_profile_ids: existingRun.ai_profile_ids,
      status: 'queued',
      execution_mode: 'offline_batch',
      character_map: {},
      provider_config: {
        provider: 'xAI',
        mode: 'tts',
      },
      retry_policy: {
        parentRunId: runId,
        regenerateExisting,
      },
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const execution = await executeGenerationRun({
      admin,
      runId: nextRunId,
      scriptId: existingRun.script_id as string,
      aiProfileIds: (existingRun.ai_profile_ids as string[]) ?? [],
      regenerateExisting,
    });

    return NextResponse.json({
      retriedFromRunId: runId,
      run: execution.run,
      profiles: execution.profiles,
      statusCounts: execution.statusCounts,
    }, { status: 201 });
  } catch (executionError) {
    return NextResponse.json(
      {
        error: executionError instanceof Error ? executionError.message : 'Retry run failed',
        runId: nextRunId,
      },
      { status: 500 }
    );
  }
}

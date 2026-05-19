import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { canManageAuditionScript, getAuditionViewerContext } from '@/lib/auditions/auth';
import {
  buildAuditionProcessingPreview,
  ensureAuditionAiProfiles,
  hydratePreviewFromStoredConfig,
  sanitizeAuditionProcessingPreview,
  type AuditionProcessingRoleBrief,
  type AuditionProcessingStoredConfig,
  type AuditionProcessingPreview,
} from '@/lib/auditions/processing';
import { buildSceneJobSeeds, enqueueSceneGenerationJobs } from '@/lib/generation/jobs';
import { loadGenerationSourceLines } from '@/lib/generation/source';
import { formatVoicePersonaLabel } from '@/lib/generation/voices';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function requireAuditionAndScript(auditionId: string) {
  const admin = createAdminClient();
  const [{ data: audition, error: auditionError }, { data: linkedScript }] = await Promise.all([
    admin.from('audition_scripts').select('*').eq('id', auditionId).single(),
    admin.from('scripts').select('*').eq('source_audition_script_id', auditionId).maybeSingle(),
  ]);

  if (auditionError || !audition) {
    throw new Error(auditionError?.message ?? 'Audition not found');
  }
  if (!linkedScript) {
    throw new Error('Apply audition processing before creating AI profiles or runs.');
  }

  return { admin, audition, linkedScript };
}

function getStoredPreview(input: { audition: { processing_notes?: Record<string, unknown> | null } }): AuditionProcessingPreview | null {
  const storedConfig = input.audition.processing_notes?.appliedConfig;
  if (!storedConfig || typeof storedConfig !== 'object') return null;
  const script = input.audition as {
    id: string;
    title: string;
    source_label: string;
    original_filename: string;
  };
  return hydratePreviewFromStoredConfig({
    auditionId: script.id,
    title: script.title,
    sourceLabel: script.source_label,
    originalFilename: script.original_filename,
    storedConfig: storedConfig as AuditionProcessingStoredConfig,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { admin, audition, linkedScript } = await requireAuditionAndScript(auditionId);
    const [{ data: profiles }, { data: runs }] = await Promise.all([
      admin
        .from('ai_profiles')
        .select('id, display_name, voice_persona_id, voice_persona_label, status, metadata')
        .eq('script_id', linkedScript.id)
        .order('created_at', { ascending: true }),
      admin
        .from('script_generation_runs')
        .select('id, status, total_lines, persisted_lines, failed_lines, created_at, started_at, finished_at')
        .eq('script_id', linkedScript.id)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    return NextResponse.json({
      linkedScript: {
        id: linkedScript.id,
        title: linkedScript.title,
        slug: linkedScript.slug,
      },
      roleBriefs: getStoredPreview({ audition })?.roleBriefs ?? [],
      profiles: profiles ?? [],
      runs: runs ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load audition AI state' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { admin, audition, linkedScript } = await requireAuditionAndScript(auditionId);
    const body = await request.json().catch(() => ({} as { roleBriefs?: AuditionProcessingRoleBrief[] }));
    const preview = getStoredPreview({ audition }) ?? await buildAuditionProcessingPreview({ admin, script: audition });
    const roleBriefs = Array.isArray(body.roleBriefs) && body.roleBriefs.length > 0
      ? sanitizeAuditionProcessingPreview({
          ...preview,
          roleBriefs: body.roleBriefs.map((brief: AuditionProcessingRoleBrief) => ({
            ...brief,
            voiceLabel: formatVoicePersonaLabel(brief.voiceId) ?? brief.voiceLabel,
          })),
        }).roleBriefs
      : preview.roleBriefs;

    await ensureAuditionAiProfiles({
      admin,
      scriptId: linkedScript.id,
      roleBriefs,
    });

    if (audition.processing_notes?.appliedConfig && typeof audition.processing_notes.appliedConfig === 'object') {
      await admin
        .from('audition_scripts')
        .update({
          processing_notes: {
            ...(audition.processing_notes ?? {}),
            appliedConfig: {
              ...(audition.processing_notes.appliedConfig as AuditionProcessingStoredConfig),
              roleBriefs,
            },
          },
        })
        .eq('id', audition.id);
    }

    const { data: profiles } = await admin
      .from('ai_profiles')
      .select('id, display_name, voice_persona_id, voice_persona_label, status, metadata')
      .eq('script_id', linkedScript.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ ok: true, profiles: profiles ?? [], roleBriefs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create audition AI profiles' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageAuditionScript(viewer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { admin, linkedScript } = await requireAuditionAndScript(auditionId);
    const body = await request.json().catch(() => ({} as { regenerateExisting?: boolean }));
    const regenerateExisting = body.regenerateExisting === true;

    const { data: profiles } = await admin
      .from('ai_profiles')
      .select('id')
      .eq('script_id', linkedScript.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    const aiProfileIds = (profiles ?? []).map((profile) => profile.id as string);
    if (aiProfileIds.length === 0) {
      return NextResponse.json({ error: 'Create AI profiles first.' }, { status: 400 });
    }

    const sourceLines = await loadGenerationSourceLines(admin, linkedScript.id);
    const sceneSeeds = buildSceneJobSeeds(sourceLines);
    if (sceneSeeds.length === 0) {
      return NextResponse.json({ error: 'No rehearsable lines found for the internal shared script.' }, { status: 400 });
    }

    const runId = randomUUID();
    const { error: insertError } = await admin.from('script_generation_runs').insert({
      id: runId,
      script_id: linkedScript.id,
      ai_profile_ids: aiProfileIds,
      status: 'queued',
      execution_mode: 'offline_batch',
      character_map: {},
      provider_config: {
        provider: 'xAI',
        mode: 'tts',
        queueMode: 'scene_jobs',
        auditionId,
      },
      retry_policy: {
        regenerateExisting,
        retryFailedOnly: true,
      },
      total_lines: 0,
      persisted_lines: 0,
      failed_lines: 0,
      error_message: null,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    const { totalLines, jobsCreated } = await enqueueSceneGenerationJobs({
      admin,
      runId,
      scriptId: linkedScript.id,
      aiProfileIds,
      sceneSeeds,
      regenerateExisting,
    });

    await admin
      .from('script_generation_runs')
      .update({ total_lines: totalLines })
      .eq('id', runId);

    const processUrl = new URL('/api/admin/ai/process', request.url);
    const workerToken = process.env.AI_GENERATION_WORKER_TOKEN ?? process.env.EXPORT_WORKER_TOKEN;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workerToken) headers['x-ai-generation-worker-token'] = workerToken;
    void fetch(processUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ runId }),
    }).catch(() => {
      // Best-effort kickoff. Queued jobs remain retryable.
    });

    return NextResponse.json({ ok: true, runId, jobsCreated, totalLines }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start audition AI run' },
      { status: 500 },
    );
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSyntheticAudioPlan, persistSyntheticAudioToR2 } from './storage';
import { countGenerationStatuses, runGenerationBatch } from './runner';
import { loadGenerationSourceLines } from './source';
import { synthesizeWithXaiTts } from './xai';
import type {
  AIProfile,
  LineGenerationRecord,
  ScriptGenerationRun,
} from '@/lib/types';
import type {
  GenerationBatchResult,
  GenerationProfile,
  GenerationRunSnapshot,
  GenerationSourceLine,
} from './types';

type ExistingRecording = {
  id: string;
  chunk_id: string;
  video_url: string;
  format: string | null;
  line_generation_record_id: string | null;
};

function formatToExtension(format: string | null): string {
  if (!format) return 'mp3';
  const lowered = format.toLowerCase();
  if (lowered.includes('wav')) return 'wav';
  if (lowered.includes('mpeg') || lowered.includes('mp3')) return 'mp3';
  if (lowered.includes('pcm')) return 'pcm';
  return 'mp3';
}

function mapProfile(profile: AIProfile): GenerationProfile {
  return {
    aiProfileId: profile.id,
    displayName: profile.display_name,
    voicePersonaId: profile.voice_persona_id,
    platform: 'Grok',
  };
}

function buildResumeSnapshot(
  runId: string,
  sourceLines: GenerationSourceLine[],
  existingRecordings: Map<string, ExistingRecording>
): GenerationRunSnapshot | null {
  const lineStates: GenerationRunSnapshot['lineStates'] = {};

  for (const line of sourceLines) {
    const existing = existingRecordings.get(line.id);
    if (!existing) continue;

    lineStates[line.id] = {
      lineId: line.id,
      status: 'persisted',
      attemptCount: 1,
      aiProfileId: null,
      sceneId: line.sceneId,
      scriptId: line.scriptId,
      chunkIndex: line.chunkIndex,
      chunkInScene: line.chunkInScene,
      interpretation: null,
      storagePlan: {
        storageKey: existing.video_url,
        contentType: existing.format ?? 'audio/mpeg',
        fileExtension: formatToExtension(existing.format),
      },
      error: null,
      updatedAt: new Date().toISOString(),
    };
  }

  return Object.keys(lineStates).length > 0 ? { runId, lineStates } : null;
}

async function listAiProfiles(
  admin: SupabaseClient,
  scriptId: string,
  aiProfileIds: string[]
): Promise<AIProfile[]> {
  const { data, error } = await admin
    .from('ai_profiles')
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .eq('script_id', scriptId)
    .in('id', aiProfileIds)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load AI profiles: ${error.message}`);
  }

  return (data ?? []) as AIProfile[];
}

async function listExistingGeneratedRecordings(
  admin: SupabaseClient,
  aiProfileId: string,
  chunkIds: string[]
): Promise<Map<string, ExistingRecording>> {
  if (chunkIds.length === 0) return new Map();

  const { data, error } = await admin
    .from('recordings')
    .select('id, chunk_id, video_url, format, line_generation_record_id')
    .eq('ai_profile_id', aiProfileId)
    .eq('recording_source', 'ai_generated')
    .in('chunk_id', chunkIds)
    .order('created_at', { ascending: false });

  if (error) {
    // Be resilient to partial production schema drift/cache lag. If this lookup fails,
    // continue as if no prior AI recordings exist and let the run proceed.
    return new Map();
  }

  const map = new Map<string, ExistingRecording>();
  for (const row of (data ?? []) as ExistingRecording[]) {
    if (!map.has(row.chunk_id)) {
      map.set(row.chunk_id, row);
    }
  }
  return map;
}

async function insertLineGenerationRecord(
  admin: SupabaseClient,
  payload: Omit<LineGenerationRecord, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const { data, error } = await admin
    .from('line_generation_records')
    .insert(payload)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to insert line generation record');
  }

  return data.id as string;
}

async function insertGeneratedRecording(input: {
  admin: SupabaseClient;
  chunkId: string;
  aiProfileId: string;
  runId: string;
  lineGenerationRecordId: string;
  storageKey: string;
  format: string;
  sizeBytes: number | null;
}): Promise<string> {
  const { data, error } = await input.admin
    .from('recordings')
    .insert({
      chunk_id: input.chunkId,
      user_id: null,
      room_id: null,
      ai_profile_id: input.aiProfileId,
      generation_run_id: input.runId,
      line_generation_record_id: input.lineGenerationRecordId,
      recording_source: 'ai_generated',
      video_url: input.storageKey,
      format: input.format,
      size_bytes: input.sizeBytes,
      duration_seconds: null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to insert AI recording');
  }

  return data.id as string;
}

async function executeSingleProfileRun(input: {
  admin: SupabaseClient;
  runId: string;
  scriptId: string;
  sourceLines: GenerationSourceLine[];
  profile: AIProfile;
  regenerateExisting: boolean;
  apiKey: string;
}): Promise<GenerationBatchResult> {
  const eligibleChunkIds = input.sourceLines.filter((line) => !line.isSystem).map((line) => line.id);
  const existingRecordings = input.regenerateExisting
    ? new Map<string, ExistingRecording>()
    : await listExistingGeneratedRecordings(input.admin, input.profile.id, eligibleChunkIds);
  const insertedLineIds = new Set<string>();
  const resume = buildResumeSnapshot(input.runId, input.sourceLines, existingRecordings);

  const result = await runGenerationBatch(
    {
      runId: input.runId,
      scriptId: input.scriptId,
      sourceLines: input.sourceLines,
      profiles: [mapProfile(input.profile)],
      assignments: [],
      defaultAiProfileId: input.profile.id,
      resume,
      retryFailedLines: true,
    },
    {
      synthesizeLine: async ({ line, interpretation }) => {
        const response = await synthesizeWithXaiTts({
          apiKey: input.apiKey,
          line,
          interpretation,
          voicePersonaId: input.profile.voice_persona_id,
        });

        return {
          audioBytes: response.audioBytes,
          contentType: response.contentType,
          fileExtension: response.fileExtension,
        };
      },
      persistArtifact: async ({ line, profile, interpretation, synthesis, storagePlan }) => {
        await persistSyntheticAudioToR2({
          plan: storagePlan,
          payload: {
            bytes: synthesis.audioBytes ?? new Uint8Array(),
            contentType: synthesis.contentType,
            fileExtension: synthesis.fileExtension,
          },
        });

        const lineGenerationRecordId = await insertLineGenerationRecord(input.admin, {
          run_id: input.runId,
          script_id: input.scriptId,
          scene_id: line.sceneId,
          chunk_id: line.id,
          ai_profile_id: profile.aiProfileId,
          status: 'synthesized',
          source_line_snapshot: line.chunkText,
          prompt_context_version: 'xai-tts-v1',
          pause_before_ms: interpretation.pauseBeforeMs,
          pause_after_ms: interpretation.pauseAfterMs,
          emotion_labels: interpretation.emotionTags,
          delivery_notes: interpretation.deliveryNotes.join(' | ') || null,
          cadence_notes: interpretation.emphasisNotes.join(' | ') || null,
          continuity_notes: interpretation.continuityNotes.join(' | ') || null,
          interpretation_provider: 'Grok',
          interpretation_request_payload: {
            voicePersonaId: input.profile.voice_persona_id,
            voicePersonaLabel: input.profile.voice_persona_label,
          },
          interpretation_response_payload: interpretation as unknown as Record<string, unknown>,
          synthesis_provider: 'Grok',
          synthesis_request_payload: {
            voicePersonaId: input.profile.voice_persona_id,
            contentType: synthesis.contentType,
          },
          synthesis_response_payload: {
            persistedToR2: true,
          },
          synthesis_asset_key: storagePlan.storageKey,
          recording_id: null,
          error_message: null,
          error_details: null,
          interpreted_at: new Date().toISOString(),
          synthesized_at: new Date().toISOString(),
          persisted_at: null,
        });

        const recordingId = await insertGeneratedRecording({
          admin: input.admin,
          chunkId: line.id,
          aiProfileId: profile.aiProfileId,
          runId: input.runId,
          lineGenerationRecordId,
          storageKey: storagePlan.storageKey,
          format: synthesis.contentType,
          sizeBytes: synthesis.audioBytes?.byteLength ?? null,
        });

        await input.admin
          .from('line_generation_records')
          .update({
            status: 'persisted',
            recording_id: recordingId,
            persisted_at: new Date().toISOString(),
            synthesis_response_payload: {
              persistedToR2: true,
              recordingId,
              byteLength: synthesis.audioBytes?.byteLength ?? null,
            },
          })
          .eq('id', lineGenerationRecordId);

        insertedLineIds.add(line.id);

        return {
          ...buildSyntheticAudioPlan({
            runId: input.runId,
            scriptId: input.scriptId,
            aiProfileId: profile.aiProfileId,
            lineId: line.id,
            contentType: synthesis.contentType,
            fileExtension: synthesis.fileExtension,
          }),
          runId: input.runId,
          scriptId: input.scriptId,
          lineId: line.id,
          aiProfileId: profile.aiProfileId,
          byteLength: synthesis.audioBytes?.byteLength ?? null,
          persistedAt: new Date().toISOString(),
        };
      },
    }
  );

  for (const [lineId, state] of Object.entries(result.lineStates)) {
    if (insertedLineIds.has(lineId)) continue;

    const line = input.sourceLines.find((entry) => entry.id === lineId);
    if (!line) continue;

    const existingRecording = existingRecordings.get(lineId) ?? null;

    await insertLineGenerationRecord(input.admin, {
      run_id: input.runId,
      script_id: input.scriptId,
      scene_id: line.sceneId,
      chunk_id: line.id,
      ai_profile_id: input.profile.id,
      status: state.status,
      source_line_snapshot: line.chunkText,
      prompt_context_version: state.status === 'persisted' ? 'existing-recording-v1' : 'xai-tts-v1',
      pause_before_ms: state.interpretation?.pauseBeforeMs ?? null,
      pause_after_ms: state.interpretation?.pauseAfterMs ?? null,
      emotion_labels: state.interpretation?.emotionTags ?? [],
      delivery_notes: state.status === 'persisted' && existingRecording
        ? 'Skipped regeneration and reused existing AI recording'
        : state.interpretation?.deliveryNotes.join(' | ') || null,
      cadence_notes: state.interpretation?.emphasisNotes.join(' | ') || null,
      continuity_notes: state.interpretation?.continuityNotes.join(' | ') || null,
      interpretation_provider: 'Grok',
      interpretation_request_payload: {
        voicePersonaId: input.profile.voice_persona_id,
        reusedExistingRecording: !!existingRecording,
      },
      interpretation_response_payload: state.interpretation as unknown as Record<string, unknown> ?? {},
      synthesis_provider: existingRecording ? 'Grok' : null,
      synthesis_request_payload: {
        skipped: !!existingRecording,
      },
      synthesis_response_payload: existingRecording
        ? {
            reusedExistingRecording: true,
            existingRecordingId: existingRecording.id,
          }
        : {},
      synthesis_asset_key: existingRecording?.video_url ?? state.storagePlan?.storageKey ?? null,
      recording_id: existingRecording?.id ?? null,
      error_message: state.error,
      error_details: state.error ? { message: state.error } : null,
      interpreted_at: state.status === 'failed' ? null : new Date().toISOString(),
      synthesized_at: state.status === 'failed' ? null : new Date().toISOString(),
      persisted_at: state.status === 'persisted' ? new Date().toISOString() : null,
    });
  }

  return result;
}

export async function executeGenerationRun(input: {
  admin: SupabaseClient;
  runId: string;
  scriptId: string;
  aiProfileIds: string[];
  regenerateExisting?: boolean;
}): Promise<{
  run: ScriptGenerationRun;
  profiles: AIProfile[];
  statusCounts: Record<string, number>;
}> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing XAI_API_KEY');
  }

  const profiles = await listAiProfiles(input.admin, input.scriptId, input.aiProfileIds);
  if (profiles.length === 0) {
    throw new Error('No AI profiles found for the requested run');
  }

  const sourceLines = await loadGenerationSourceLines(input.admin, input.scriptId);
  const eligibleLineCount = sourceLines.filter((line) => !line.isSystem).length;
  const totalLines = eligibleLineCount * profiles.length;
  const aggregateCounts: Record<string, number> = {
    pending: 0,
    interpreted: 0,
    synthesized: 0,
    persisted: 0,
    failed: 0,
  };

  await input.admin
    .from('script_generation_runs')
    .update({
      status: 'processing',
      total_lines: totalLines,
      started_at: new Date().toISOString(),
      provider_config: {
        provider: 'xAI',
        endpoint: 'https://api.x.ai/v1/tts',
      },
    })
    .eq('id', input.runId);

  try {
    for (const profile of profiles) {
      const result = await executeSingleProfileRun({
        admin: input.admin,
        runId: input.runId,
        scriptId: input.scriptId,
        sourceLines,
        profile,
        regenerateExisting: input.regenerateExisting ?? false,
        apiKey,
      });

      const counts = countGenerationStatuses(result.lineStates);
      for (const [status, count] of Object.entries(counts)) {
        aggregateCounts[status] = (aggregateCounts[status] ?? 0) + count;
      }
    }

    const { data, error } = await input.admin
      .from('script_generation_runs')
      .update({
        status: aggregateCounts.failed > 0 ? 'failed' : 'succeeded',
        persisted_lines: aggregateCounts.persisted ?? 0,
        failed_lines: aggregateCounts.failed ?? 0,
        finished_at: new Date().toISOString(),
        error_message: aggregateCounts.failed > 0 ? 'One or more lines failed to generate' : null,
      })
      .eq('id', input.runId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to finalize generation run');
    }

    return {
      run: data as ScriptGenerationRun,
      profiles,
      statusCounts: aggregateCounts,
    };
  } catch (error) {
    await input.admin
      .from('script_generation_runs')
      .update({
        status: 'failed',
        persisted_lines: aggregateCounts.persisted ?? 0,
        failed_lines: aggregateCounts.failed ?? 0,
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Generation failed',
      })
      .eq('id', input.runId);

    throw error;
  }
}

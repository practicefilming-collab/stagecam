import { randomUUID } from 'crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SupabaseClient } from '@supabase/supabase-js';
import { r2, R2_BUCKET } from '@/lib/r2';
import { buildSyntheticAudioPlan, persistSyntheticAudioToR2 } from '@/lib/generation/storage';
import { formatVoicePersonaLabel, normalizeVoicePersonaId } from '@/lib/generation/voices';
import { synthesizeWithXaiTts } from '@/lib/generation/xai';
import { buildDefaultInterpretation } from '@/lib/generation/runner';
import { loadGenerationSourceLines } from '@/lib/generation/source';
import {
  insertGeneratedRecording,
  listExistingGeneratedRecordings,
  upsertLineGenerationRecord,
  type ExistingRecording,
} from '@/lib/generation/execute';
import type {
  AIProfile,
  AuditionScene,
  AuditionScript,
  Script,
} from '@/lib/types';
import {
  ensureAuditionInternalScriptFromPreparedScenes,
  type AuditionProcessingStoredConfig,
  type AuditionProcessingRoleBrief,
} from './processing';
import { parseAuditionSceneRuntimeLines } from './scene-runtime';

const NARRATOR_PROFILE_NAME = 'Narrator';
const NARRATOR_VOICE_ID = 'leo';

type SceneRow = {
  id: string;
  scene_number: number;
  scene_heading: string | null;
  processing_metadata: Record<string, unknown> | null;
};

type ChunkRow = {
  id: string;
  scene_id: string;
  chunk_in_scene: number;
  chunk_index: number;
  type: 'scene_heading' | 'action' | 'dialogue' | 'transition';
  character: string | null;
  tts_text: string | null;
  chunk_text: string;
  is_system: boolean | null;
};

type AuditionLineBridge = {
  auditionSceneId: string;
  auditionSceneOrder: number;
  sequenceIndex: number;
  roleName: string | null;
  lineText: string;
  sharedSceneId: string;
  chunkId: string;
  aiProfileId: string;
  aiProfileName: string;
};

type CoverageSummary = {
  required_line_count: number;
  ready_line_count: number;
  failed_line_count: number;
  latest_generated_at: string | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function buildNarratorProfilePayload(scriptId: string) {
  return {
    script_id: scriptId,
    display_name: NARRATOR_PROFILE_NAME,
    status: 'active',
    platform: 'Grok' as const,
    voice_persona_id: NARRATOR_VOICE_ID,
    voice_persona_label: formatVoicePersonaLabel(NARRATOR_VOICE_ID),
    metadata: {
      systemProfile: true,
      purpose: 'audition_fallback_narration',
    },
  };
}

function getStoredRoleBriefs(audition: Pick<AuditionScript, 'processing_notes'>): AuditionProcessingRoleBrief[] {
  const config = audition.processing_notes?.appliedConfig;
  if (!config || typeof config !== 'object') return [];
  return (((config as AuditionProcessingStoredConfig).roleBriefs) ?? []).filter(Boolean);
}

async function getLinkedScript(admin: SupabaseClient, auditionId: string) {
  const { data } = await admin
    .from('scripts')
    .select('id, title, slug, is_internal, source_audition_script_id')
    .eq('source_audition_script_id', auditionId)
    .maybeSingle();

  return (data as Pick<Script, 'id' | 'title' | 'slug' | 'is_internal' | 'source_audition_script_id'> | null) ?? null;
}

async function ensureNarratorProfile(admin: SupabaseClient, scriptId: string): Promise<AIProfile> {
  const payload = buildNarratorProfilePayload(scriptId);
  const { data, error } = await admin
    .from('ai_profiles')
    .upsert(payload, { onConflict: 'script_id,display_name' })
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to ensure narrator voice profile');
  }

  return data as AIProfile;
}

async function loadProfilesForAuditionScript(input: {
  admin: SupabaseClient;
  linkedScriptId: string;
  audition: AuditionScript;
}) {
  const narrator = await ensureNarratorProfile(input.admin, input.linkedScriptId);
  const { data, error } = await input.admin
    .from('ai_profiles')
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .eq('script_id', input.linkedScriptId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) throw error;
  const profiles = (data ?? []) as AIProfile[];
  const storedRoleBriefs = getStoredRoleBriefs(input.audition);
  const requiredRoles = new Set(storedRoleBriefs.map((brief) => brief.roleName));
  const profileByName = new Map(profiles.map((profile) => [profile.display_name, profile]));

  for (const roleBrief of storedRoleBriefs) {
    const profile = profileByName.get(roleBrief.roleName);
    const normalized = normalizeVoicePersonaId(roleBrief.voiceId);
    if (!profile || !normalized) {
      throw new Error(`Role ${roleBrief.roleName} is missing a valid shared-script voice profile.`);
    }
  }

  const seenVoiceIds = new Map<string, string>();
  for (const roleName of requiredRoles) {
    const voiceId = normalizeVoicePersonaId(profileByName.get(roleName)?.voice_persona_id) ?? null;
    if (!voiceId) {
      throw new Error(`Role ${roleName} does not have a usable Grok voice id.`);
    }
    const existingRole = seenVoiceIds.get(voiceId);
    if (existingRole && existingRole !== roleName) {
      throw new Error(`Roles ${existingRole} and ${roleName} share Grok voice ${voiceId}. Each character needs a distinct voice.`);
    }
    seenVoiceIds.set(voiceId, roleName);
  }

  profileByName.set(narrator.display_name, narrator);

  return {
    narrator,
    profiles,
    profileByName,
  };
}

async function loadSharedScriptStructure(admin: SupabaseClient, linkedScriptId: string) {
  const [{ data: scenes, error: scenesError }, { data: chunks, error: chunksError }] = await Promise.all([
    admin
      .from('scenes')
      .select('id, scene_number, scene_heading, processing_metadata, acts!inner(script_id)')
      .eq('acts.script_id', linkedScriptId)
      .order('scene_number', { ascending: true }),
    admin
      .from('chunks')
      .select('id, scene_id, chunk_in_scene, chunk_index, type, character, tts_text, chunk_text, is_system')
      .order('chunk_index', { ascending: true }),
  ]);

  if (scenesError) throw scenesError;
  if (chunksError) throw chunksError;

  const sceneRows = (scenes ?? []) as Array<SceneRow & { acts?: Array<{ script_id: string }> | null }>;
  const sceneIds = new Set(sceneRows.map((scene) => scene.id));
  const chunkRows = ((chunks ?? []) as ChunkRow[]).filter((chunk) => sceneIds.has(chunk.scene_id));

  return {
    scenes: sceneRows.map((scene) => ({
      id: scene.id,
      scene_number: scene.scene_number,
      scene_heading: scene.scene_heading,
      processing_metadata: scene.processing_metadata,
    })),
    chunks: chunkRows,
  };
}

function buildAuditionLineBridge(input: {
  auditionScenes: AuditionScene[];
  sharedScenes: SceneRow[];
  sharedChunks: ChunkRow[];
  profileByName: Map<string, AIProfile>;
}) {
  const sharedSceneByNumber = new Map(input.sharedScenes.map((scene) => [scene.scene_number, scene]));
  const chunksByScene = new Map<string, ChunkRow[]>();
  for (const chunk of input.sharedChunks) {
    const list = chunksByScene.get(chunk.scene_id) ?? [];
    list.push(chunk);
    chunksByScene.set(chunk.scene_id, list);
  }

  const bridges: AuditionLineBridge[] = [];
  for (const auditionScene of input.auditionScenes) {
    const sharedScene = sharedSceneByNumber.get(auditionScene.order_index);
    if (!sharedScene) {
      throw new Error(`Could not map audition scene ${auditionScene.label} to hidden shared scene ${auditionScene.order_index}.`);
    }

    const sharedSceneChunks = chunksByScene.get(sharedScene.id) ?? [];
    const runtimeLines = parseAuditionSceneRuntimeLines(auditionScene.scene_text);

    for (const runtimeLine of runtimeLines) {
      const expectedChunkInScene = runtimeLine.sequenceIndex + 2;
      const mappedChunk = sharedSceneChunks.find((chunk) => chunk.chunk_in_scene === expectedChunkInScene)
        ?? sharedSceneChunks.find((chunk) =>
          normalizeText(chunk.tts_text ?? chunk.chunk_text) === normalizeText(runtimeLine.text),
        );

      if (!mappedChunk) {
        throw new Error(`Could not map audition line ${runtimeLine.sequenceIndex + 1} in ${auditionScene.label} to a hidden shared-script chunk.`);
      }

      const profile = runtimeLine.roleName
        ? input.profileByName.get(runtimeLine.roleName)
        : input.profileByName.get(NARRATOR_PROFILE_NAME);

      if (!profile) {
        throw new Error(`No shared-script profile available for ${runtimeLine.roleName ?? 'Narrator'}.`);
      }

      bridges.push({
        auditionSceneId: auditionScene.id,
        auditionSceneOrder: auditionScene.order_index,
        sequenceIndex: runtimeLine.sequenceIndex,
        roleName: runtimeLine.roleName,
        lineText: runtimeLine.text,
        sharedSceneId: sharedScene.id,
        chunkId: mappedChunk.id,
        aiProfileId: profile.id,
        aiProfileName: profile.display_name,
      });
    }
  }

  return bridges;
}

function groupContextLines(sourceLines: Awaited<ReturnType<typeof loadGenerationSourceLines>>) {
  const map = new Map<string, typeof sourceLines>();
  for (const line of sourceLines) {
    const list = map.get(line.sceneId) ?? [];
    list.push(line);
    map.set(line.sceneId, list);
  }
  return map;
}

async function signR2Object(storageKey: string) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

function pickLatestRecordingMap(rows: ExistingRecording[]) {
  const map = new Map<string, ExistingRecording>();
  for (const row of rows) {
    const key = `${row.chunk_id}:${row.ai_profile_id ?? ''}`;
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

async function listSharedGeneratedRecordings(admin: SupabaseClient, chunkIds: string[], aiProfileIds: string[]) {
  if (chunkIds.length === 0 || aiProfileIds.length === 0) return new Map<string, ExistingRecording>();
  const { data, error } = await admin
    .from('recordings')
    .select('id, chunk_id, ai_profile_id, video_url, format, line_generation_record_id, created_at')
    .eq('recording_source', 'ai_generated')
    .in('chunk_id', chunkIds)
    .in('ai_profile_id', aiProfileIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return pickLatestRecordingMap((data ?? []) as Array<ExistingRecording & { ai_profile_id?: string | null; created_at?: string }>);
}

async function listLatestFailedGenerationMap(admin: SupabaseClient, chunkIds: string[], aiProfileIds: string[]) {
  if (chunkIds.length === 0 || aiProfileIds.length === 0) return new Map<string, boolean>();
  const { data, error } = await admin
    .from('line_generation_records')
    .select('chunk_id, ai_profile_id, status, updated_at')
    .in('chunk_id', chunkIds)
    .in('ai_profile_id', aiProfileIds)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const map = new Map<string, boolean>();
  for (const row of (data ?? []) as Array<{ chunk_id: string; ai_profile_id: string; status: string }>) {
    const key = `${row.chunk_id}:${row.ai_profile_id}`;
    if (!map.has(key)) {
      map.set(key, row.status === 'failed');
    }
  }
  return map;
}

async function loadSharedCoverage(input: {
  admin: SupabaseClient;
  audition: Pick<AuditionScript, 'id' | 'processing_notes'>;
  linkedScriptId: string;
  auditionScenes: AuditionScene[];
}) {
  const { profileByName } = await loadProfilesForAuditionScript({
    admin: input.admin,
    linkedScriptId: input.linkedScriptId,
    audition: input.audition as AuditionScript,
  });
  const { scenes: sharedScenes, chunks: sharedChunks } = await loadSharedScriptStructure(input.admin, input.linkedScriptId);
  const bridges = buildAuditionLineBridge({
    auditionScenes: input.auditionScenes,
    sharedScenes,
    sharedChunks,
    profileByName,
  });

  const recordings = await listSharedGeneratedRecordings(
    input.admin,
    [...new Set(bridges.map((bridge) => bridge.chunkId))],
    [...new Set(bridges.map((bridge) => bridge.aiProfileId))],
  );
  const failures = await listLatestFailedGenerationMap(
    input.admin,
    [...new Set(bridges.map((bridge) => bridge.chunkId))],
    [...new Set(bridges.map((bridge) => bridge.aiProfileId))],
  );

  const sceneCoverage = new Map<string, CoverageSummary>();
  for (const bridge of bridges) {
    const key = `${bridge.chunkId}:${bridge.aiProfileId}`;
    const recording = recordings.get(key);
    const summary = sceneCoverage.get(bridge.auditionSceneId) ?? {
      required_line_count: 0,
      ready_line_count: 0,
      failed_line_count: 0,
      latest_generated_at: null,
    };
    summary.required_line_count += 1;
    if (recording) {
      summary.ready_line_count += 1;
    } else if (failures.get(key)) {
      summary.failed_line_count += 1;
    }
    sceneCoverage.set(bridge.auditionSceneId, summary);
  }

  return {
    bridges,
    recordings,
    sceneCoverage,
  };
}

export function mergeLevel1AudioMetadata<T extends Pick<AuditionScene, 'id' | 'processing_metadata'>>(
  scenes: T[],
  sceneCoverage: Map<string, CoverageSummary>,
): T[] {
  return scenes.map((scene) => {
    const coverage = sceneCoverage.get(scene.id) ?? {
      required_line_count: 0,
      ready_line_count: 0,
      failed_line_count: 0,
      latest_generated_at: null,
    };
    return {
      ...scene,
      processing_metadata: {
        ...(scene.processing_metadata ?? {}),
        level1_audio: coverage,
      },
    };
  });
}

export async function loadAuditionSharedAudioCoverage(input: {
  admin: SupabaseClient;
  audition: Pick<AuditionScript, 'id' | 'processing_notes'>;
  linkedScriptId: string | null;
  auditionScenes: AuditionScene[];
}) {
  if (!input.linkedScriptId || input.auditionScenes.length === 0) {
    return new Map<string, CoverageSummary>();
  }
  const { sceneCoverage } = await loadSharedCoverage({
    admin: input.admin,
    audition: input.audition,
    linkedScriptId: input.linkedScriptId,
    auditionScenes: input.auditionScenes,
  });
  return sceneCoverage;
}

export async function buildAuditionSharedAudioUrlMap(input: {
  admin: SupabaseClient;
  audition: Pick<AuditionScript, 'id' | 'processing_notes'>;
  linkedScriptId: string | null;
  auditionScene: AuditionScene;
}) {
  if (!input.linkedScriptId) return new Map<number, string | null>();
  const { bridges, recordings } = await loadSharedCoverage({
    admin: input.admin,
    audition: input.audition,
    linkedScriptId: input.linkedScriptId,
    auditionScenes: [input.auditionScene],
  });

  const urlMap = new Map<number, string | null>();
  await Promise.all(bridges.map(async (bridge) => {
    const recording = recordings.get(`${bridge.chunkId}:${bridge.aiProfileId}`);
    if (!recording?.video_url) {
      urlMap.set(bridge.sequenceIndex, null);
      return;
    }
    try {
      const url = await signR2Object(recording.video_url);
      urlMap.set(bridge.sequenceIndex, url);
    } catch {
      urlMap.set(bridge.sequenceIndex, null);
    }
  }));
  return urlMap;
}

export async function generateAuditionLevel1Audio(input: {
  admin: SupabaseClient;
  audition: AuditionScript;
  sceneId?: string | null;
  regenerate?: boolean;
}) {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing XAI_API_KEY');

  const { data: scenes, error } = await input.admin
    .from('audition_scenes')
    .select('*, audition_roles(name)')
    .eq('audition_script_id', input.audition.id)
    .eq('is_active', true)
    .order('order_index', { ascending: true });
  if (error) throw error;

  const auditionSceneRows = (scenes ?? []) as Array<AuditionScene & { audition_roles?: Array<{ name: string }> }>;
  const auditionScenes = auditionSceneRows.filter((scene) =>
    input.sceneId ? scene.id === input.sceneId : true,
  );
  if (auditionScenes.length === 0) {
    throw new Error('No audition scenes available for fallback generation.');
  }

  let linkedScript = await getLinkedScript(input.admin, input.audition.id);
  if (!linkedScript) {
    const prepared = await ensureAuditionInternalScriptFromPreparedScenes({
      admin: input.admin,
      audition: input.audition,
      scenes: auditionSceneRows.map((scene) => ({
        id: scene.id,
        label: scene.label,
        order_index: scene.order_index,
        source_page_ref: scene.source_page_ref,
        scene_text: scene.scene_text,
        roles: (scene.audition_roles ?? []).map((role) => ({ name: role.name })),
      })),
      processorUserId: input.audition.processed_by_admin_id ?? input.audition.uploaded_by_user_id,
    });
    linkedScript = prepared.linkedScript;
    input.audition.processing_notes = {
      ...(input.audition.processing_notes ?? {}),
      appliedConfig: prepared.preview ? {
        roleNames: prepared.preview.roleNames,
        scenes: prepared.preview.scenes.map((scene) => ({
          orderIndex: scene.orderIndex,
          scenarioNumber: scene.scenarioNumber,
          heading: scene.heading,
          label: scene.label,
          sourcePageRef: scene.sourcePageRef,
          sceneText: scene.sceneText,
          roleNames: scene.roleNames,
          sceneObjective: scene.sceneObjective,
          dramaticPurpose: scene.dramaticPurpose,
          emotionalTemperature: scene.emotionalTemperature,
          subtext: scene.subtext,
          rehearsalEmphasis: scene.rehearsalEmphasis,
        })),
        roleBriefs: prepared.preview.roleBriefs,
        cleanupLog: prepared.preview.cleanupLog,
        ambiguityLog: prepared.preview.ambiguityLog,
        internalScript: prepared.preview.internalScript,
      } : undefined,
      linkedScriptId: linkedScript.id,
    };
  }

  const { profileByName } = await loadProfilesForAuditionScript({
    admin: input.admin,
    linkedScriptId: linkedScript.id,
    audition: input.audition,
  });
  const { scenes: sharedScenes, chunks: sharedChunks } = await loadSharedScriptStructure(input.admin, linkedScript.id);
  const bridges = buildAuditionLineBridge({
    auditionScenes,
    sharedScenes,
    sharedChunks,
    profileByName,
  });

  const sourceLines = await loadGenerationSourceLines(input.admin, linkedScript.id);
  const lineById = new Map(sourceLines.map((line) => [line.id, line]));
  const contextByScene = groupContextLines(sourceLines);
  const existingByProfile = new Map<string, Map<string, ExistingRecording>>();
  for (const aiProfileId of [...new Set(bridges.map((bridge) => bridge.aiProfileId))]) {
    const chunkIds = bridges.filter((bridge) => bridge.aiProfileId === aiProfileId).map((bridge) => bridge.chunkId);
    const existing = input.regenerate
      ? new Map<string, ExistingRecording>()
      : await listExistingGeneratedRecordings(input.admin, aiProfileId, chunkIds);
    existingByProfile.set(aiProfileId, existing);
  }

  const runId = randomUUID();
  const aiProfileIds = [...new Set(bridges.map((bridge) => bridge.aiProfileId))];
  await input.admin.from('script_generation_runs').insert({
    id: runId,
    script_id: linkedScript.id,
    ai_profile_ids: aiProfileIds,
    status: 'processing',
    execution_mode: 'offline_batch',
    character_map: Object.fromEntries(
      [...profileByName.entries()].map(([name, profile]) => [name, profile.id]),
    ),
    provider_config: {
      provider: 'xAI',
      mode: 'audition_level1_bridge',
      auditionId: input.audition.id,
    },
    retry_policy: {
      regenerateExisting: input.regenerate === true,
      retryFailedOnly: true,
    },
    total_lines: bridges.length,
    persisted_lines: 0,
    failed_lines: 0,
    error_message: null,
    started_at: new Date().toISOString(),
    finished_at: null,
  });

  let generatedCount = 0;
  let reusedCount = 0;
  let failedCount = 0;

  for (const bridge of bridges) {
    const existing = existingByProfile.get(bridge.aiProfileId)?.get(bridge.chunkId) ?? null;
    if (existing && !input.regenerate) {
      reusedCount += 1;
      continue;
    }

    const line = lineById.get(bridge.chunkId);
    const profile = profileByName.get(bridge.aiProfileName);
    if (!line || !profile) {
      failedCount += 1;
      continue;
    }

    const contextLines = contextByScene.get(line.sceneId) ?? [line];
    const interpretation = buildDefaultInterpretation(
      line,
      contextLines.filter((candidate) => Math.abs(candidate.chunkInScene - line.chunkInScene) <= 2),
    );

    try {
      const synthesis = await synthesizeWithXaiTts({
        apiKey,
        line,
        interpretation,
        voicePersonaId: profile.voice_persona_id,
      });

      const storagePlan = buildSyntheticAudioPlan({
        runId,
        scriptId: linkedScript.id,
        aiProfileId: profile.id,
        lineId: line.id,
        contentType: synthesis.contentType,
        fileExtension: synthesis.fileExtension,
      });

      await persistSyntheticAudioToR2({
        plan: storagePlan,
        payload: {
          bytes: synthesis.audioBytes,
          contentType: synthesis.contentType,
          fileExtension: synthesis.fileExtension,
        },
      });

      const lineGenerationRecordId = await upsertLineGenerationRecord(input.admin, {
        run_id: runId,
        script_id: linkedScript.id,
        scene_id: line.sceneId,
        chunk_id: line.id,
        ai_profile_id: profile.id,
        status: 'synthesized',
        source_line_snapshot: line.chunkText,
        prompt_context_version: 'audition-level1-via-grok',
        pause_before_ms: interpretation.pauseBeforeMs,
        pause_after_ms: interpretation.pauseAfterMs,
        emotion_labels: interpretation.emotionTags,
        delivery_notes: interpretation.deliveryNotes.join(' | ') || null,
        cadence_notes: interpretation.emphasisNotes.join(' | ') || null,
        continuity_notes: interpretation.continuityNotes.join(' | ') || null,
        interpretation_provider: 'Grok',
        interpretation_request_payload: {
          voicePersonaId: profile.voice_persona_id,
          voicePersonaLabel: profile.voice_persona_label,
          interpretationSource: interpretation.interpretationSource,
        },
        interpretation_response_payload: interpretation as unknown as Record<string, unknown>,
        synthesis_provider: 'Grok',
        synthesis_request_payload: synthesis.requestPayload,
        synthesis_response_payload: synthesis.responsePayload,
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
        aiProfileId: profile.id,
        runId,
        lineGenerationRecordId,
        storageKey: storagePlan.storageKey,
        format: synthesis.contentType,
        sizeBytes: synthesis.audioBytes.byteLength,
      });

      await input.admin
        .from('line_generation_records')
        .update({
          status: 'persisted',
          recording_id: recordingId,
          persisted_at: new Date().toISOString(),
        })
        .eq('id', lineGenerationRecordId);

      generatedCount += 1;
    } catch (generationError) {
      failedCount += 1;
      await upsertLineGenerationRecord(input.admin, {
        run_id: runId,
        script_id: linkedScript.id,
        scene_id: line.sceneId,
        chunk_id: line.id,
        ai_profile_id: profile.id,
        status: 'failed',
        source_line_snapshot: line.chunkText,
        prompt_context_version: 'audition-level1-via-grok',
        pause_before_ms: interpretation.pauseBeforeMs,
        pause_after_ms: interpretation.pauseAfterMs,
        emotion_labels: interpretation.emotionTags,
        delivery_notes: interpretation.deliveryNotes.join(' | ') || null,
        cadence_notes: interpretation.emphasisNotes.join(' | ') || null,
        continuity_notes: interpretation.continuityNotes.join(' | ') || null,
        interpretation_provider: 'Grok',
        interpretation_request_payload: {
          voicePersonaId: profile.voice_persona_id,
          voicePersonaLabel: profile.voice_persona_label,
        },
        interpretation_response_payload: {},
        synthesis_provider: 'Grok',
        synthesis_request_payload: {},
        synthesis_response_payload: {},
        synthesis_asset_key: null,
        recording_id: null,
        error_message: generationError instanceof Error ? generationError.message : 'Shared fallback generation failed',
        error_details: null,
        interpreted_at: new Date().toISOString(),
        synthesized_at: null,
        persisted_at: null,
      });
    }
  }

  await input.admin
    .from('script_generation_runs')
    .update({
      status: failedCount > 0 ? 'failed' : 'succeeded',
      persisted_lines: generatedCount + reusedCount,
      failed_lines: failedCount,
      error_message: failedCount > 0 ? 'One or more fallback lines failed to generate' : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  return {
    generatedCount,
    reusedCount,
    failedCount,
    sceneCount: auditionScenes.length,
  };
}

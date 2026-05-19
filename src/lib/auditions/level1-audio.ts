import { randomUUID } from 'crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditionLevel1AudioAsset,
  AuditionScene,
  AuditionScript,
} from '@/lib/types';
import { persistSyntheticAudioToR2 } from '@/lib/generation/storage';
import type { GenerationLineInterpretation, GenerationSourceLine } from '@/lib/generation/types';
import { formatVoicePersonaLabel, normalizeVoicePersonaId } from '@/lib/generation/voices';
import { synthesizeWithXaiTts } from '@/lib/generation/xai';
import { r2, R2_BUCKET } from '@/lib/r2';
import type { AuditionProcessingStoredConfig, AuditionProcessingRoleBrief } from './processing';
import { parseAuditionSceneRuntimeLines } from './scene-runtime';

const LEVEL1_NARRATOR_VOICE_ID = 'leo';

function buildLevel1StorageKey(input: {
  auditionId: string;
  sceneId: string;
  sequenceIndex: number;
  voiceId: string;
  fileExtension: string;
}) {
  const ext = input.fileExtension.replace(/^\./, '') || 'mp3';
  const sequence = String(input.sequenceIndex).padStart(3, '0');
  return `auditions/${input.auditionId}/level1/${input.sceneId}/${sequence}-${input.voiceId}.${ext}`;
}

function buildLevel1Interpretation(roleName: string | null): GenerationLineInterpretation {
  return {
    interpretationSource: 'fallback_heuristic',
    pauseBeforeMs: roleName ? 120 : 0,
    pauseAfterMs: roleName ? 120 : 80,
    emotionTags: roleName ? ['calm'] : ['clear'],
    deliveryNotes: [roleName ? 'Baseline audition cue read.' : 'Narrate the stage direction clearly and neutrally.'],
    continuityNotes: [],
    emphasisNotes: [],
    promptSummary: roleName ? 'Baseline character cue audio' : 'Narrator cue audio',
  };
}

function buildLevel1SourceLine(input: {
  auditionId: string;
  scene: Pick<AuditionScene, 'id' | 'label' | 'scene_text' | 'processing_metadata'>;
  sequenceIndex: number;
  roleName: string | null;
  text: string;
  type: 'dialogue' | 'cue';
}): GenerationSourceLine {
  return {
    id: `${input.scene.id}:${input.sequenceIndex}`,
    scriptId: input.auditionId,
    sceneId: input.scene.id,
    sceneHeading: input.scene.label,
    sceneMetadata: input.scene.processing_metadata ?? null,
    chunkIndex: input.sequenceIndex,
    chunkInScene: input.sequenceIndex + 1,
    type: input.type === 'dialogue' ? 'dialogue' : 'action',
    character: input.roleName,
    ttsText: input.text,
    chunkText: input.text,
    isSystem: input.type === 'cue',
  };
}

function getStoredRoleBriefs(audition: Pick<AuditionScript, 'processing_notes'>): AuditionProcessingRoleBrief[] {
  const config = audition.processing_notes?.appliedConfig;
  if (!config || typeof config !== 'object') return [];
  return (((config as AuditionProcessingStoredConfig).roleBriefs) ?? []).filter(Boolean);
}

function getRequiredLineCount(scene: Pick<AuditionScene, 'scene_text'>) {
  return parseAuditionSceneRuntimeLines(scene.scene_text).length;
}

export function mergeLevel1AudioMetadata<T extends Pick<AuditionScene, 'id' | 'scene_text' | 'processing_metadata'>>(
  scenes: T[],
  assets: AuditionLevel1AudioAsset[],
): T[] {
  const assetsByScene = new Map<string, AuditionLevel1AudioAsset[]>();
  for (const asset of assets) {
    const list = assetsByScene.get(asset.audition_scene_id) ?? [];
    list.push(asset);
    assetsByScene.set(asset.audition_scene_id, list);
  }

  return scenes.map((scene) => {
    const sceneAssets = assetsByScene.get(scene.id) ?? [];
    const readyLineCount = sceneAssets.filter((asset) => asset.status === 'ready').length;
    const failedLineCount = sceneAssets.filter((asset) => asset.status === 'failed').length;
    const requiredLineCount = getRequiredLineCount(scene);
    const latestGeneratedAt = sceneAssets
      .map((asset) => asset.generated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return {
      ...scene,
      processing_metadata: {
        ...(scene.processing_metadata ?? {}),
        level1_audio: {
          required_line_count: requiredLineCount,
          ready_line_count: readyLineCount,
          failed_line_count: failedLineCount,
          latest_generated_at: latestGeneratedAt,
        },
      },
    };
  });
}

export async function listLevel1AudioAssetsForScenes(
  admin: SupabaseClient,
  sceneIds: string[],
): Promise<AuditionLevel1AudioAsset[]> {
  if (sceneIds.length === 0) return [];
  const { data, error } = await admin
    .from('audition_level1_audio_assets')
    .select('*')
    .in('audition_scene_id', sceneIds)
    .order('sequence_index', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuditionLevel1AudioAsset[];
}

async function signR2Object(storageKey: string) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

export async function buildSignedLevel1AudioUrlMap(assets: AuditionLevel1AudioAsset[]) {
  const urlMap = new Map<string, string | null>();
  await Promise.all(assets.map(async (asset) => {
    if (!asset.storage_key || asset.status !== 'ready') {
      urlMap.set(`${asset.audition_scene_id}:${asset.sequence_index}`, null);
      return;
    }
    try {
      const url = await signR2Object(asset.storage_key);
      urlMap.set(`${asset.audition_scene_id}:${asset.sequence_index}`, url);
    } catch {
      urlMap.set(`${asset.audition_scene_id}:${asset.sequence_index}`, null);
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
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('Missing XAI_API_KEY');

  const roleBriefs = getStoredRoleBriefs(input.audition);
  if (roleBriefs.length === 0) {
    throw new Error('Apply scene prep and sync role voices before generating Level 1 audio.');
  }

  const { data: scenes, error } = await input.admin
    .from('audition_scenes')
    .select('id, audition_script_id, label, order_index, source_page_ref, scene_text, is_active, processing_metadata, created_at, updated_at')
    .eq('audition_script_id', input.audition.id)
    .eq('is_active', true)
    .order('order_index', { ascending: true });

  if (error) throw error;

  const targetScenes = ((scenes ?? []) as AuditionScene[]).filter((scene) =>
    input.sceneId ? scene.id === input.sceneId : true,
  );
  if (targetScenes.length === 0) {
    throw new Error('No audition scenes available for Level 1 generation.');
  }

  const roleVoiceMap = new Map<string, { voiceId: string; voiceLabel: string | null }>();
  for (const brief of roleBriefs) {
    const voiceId = normalizeVoicePersonaId(brief.voiceId);
    if (!voiceId) {
      throw new Error(`Role ${brief.roleName} is missing a valid voice persona.`);
    }
    roleVoiceMap.set(brief.roleName, {
      voiceId,
      voiceLabel: brief.voiceLabel || formatVoicePersonaLabel(voiceId),
    });
  }

  const usedRoleVoices = new Map<string, string>();
  for (const scene of targetScenes) {
    for (const line of parseAuditionSceneRuntimeLines(scene.scene_text)) {
      if (!line.roleName) continue;
      const mapped = roleVoiceMap.get(line.roleName);
      if (!mapped) {
        throw new Error(`No role voice is configured for ${line.roleName}.`);
      }
      const existingRole = [...usedRoleVoices.entries()].find(([, voiceId]) => voiceId === mapped.voiceId)?.[0];
      if (existingRole && existingRole !== line.roleName) {
        throw new Error(`Roles ${existingRole} and ${line.roleName} share voice ${mapped.voiceId}. Each character needs a distinct voice.`);
      }
      usedRoleVoices.set(line.roleName, mapped.voiceId);
    }
  }

  const existingAssets = await listLevel1AudioAssetsForScenes(input.admin, targetScenes.map((scene) => scene.id));
  const existingByKey = new Map(existingAssets.map((asset) => [`${asset.audition_scene_id}:${asset.sequence_index}`, asset]));

  let generatedCount = 0;
  let reusedCount = 0;

  for (const scene of targetScenes) {
    const runtimeLines = parseAuditionSceneRuntimeLines(scene.scene_text);

    for (const runtimeLine of runtimeLines) {
      const key = `${scene.id}:${runtimeLine.sequenceIndex}`;
      const existing = existingByKey.get(key);
      if (!input.regenerate && existing?.status === 'ready' && existing.storage_key) {
        reusedCount += 1;
        continue;
      }

      const voiceId = runtimeLine.roleName
        ? roleVoiceMap.get(runtimeLine.roleName)?.voiceId
        : LEVEL1_NARRATOR_VOICE_ID;
      if (!voiceId) {
        throw new Error(`Missing voice mapping for ${runtimeLine.roleName ?? 'scene cue'}.`);
      }

      const sourceLine = buildLevel1SourceLine({
        auditionId: input.audition.id,
        scene,
        sequenceIndex: runtimeLine.sequenceIndex,
        roleName: runtimeLine.roleName,
        text: runtimeLine.text,
        type: runtimeLine.kind,
      });
      const interpretation = buildLevel1Interpretation(runtimeLine.roleName);

      try {
        const synthesis = await synthesizeWithXaiTts({
          apiKey,
          line: sourceLine,
          interpretation,
          voicePersonaId: voiceId,
        });

        const storageKey = buildLevel1StorageKey({
          auditionId: input.audition.id,
          sceneId: scene.id,
          sequenceIndex: runtimeLine.sequenceIndex,
          voiceId,
          fileExtension: synthesis.fileExtension,
        });

        await persistSyntheticAudioToR2({
          plan: {
            storageKey,
            contentType: synthesis.contentType,
            fileExtension: synthesis.fileExtension,
          },
          payload: {
            bytes: synthesis.audioBytes,
            contentType: synthesis.contentType,
            fileExtension: synthesis.fileExtension,
          },
        });

        const row = {
          id: existing?.id ?? randomUUID(),
          audition_script_id: input.audition.id,
          audition_scene_id: scene.id,
          sequence_index: runtimeLine.sequenceIndex,
          role_name: runtimeLine.roleName,
          line_text: runtimeLine.text,
          voice_persona_id: voiceId,
          voice_persona_label: runtimeLine.roleName
            ? (roleVoiceMap.get(runtimeLine.roleName)?.voiceLabel ?? formatVoicePersonaLabel(voiceId))
            : formatVoicePersonaLabel(voiceId),
          status: 'ready' as const,
          storage_key: storageKey,
          content_type: synthesis.contentType,
          byte_length: synthesis.audioBytes.byteLength,
          request_payload: synthesis.requestPayload,
          response_payload: synthesis.responsePayload,
          error_message: null,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await input.admin
          .from('audition_level1_audio_assets')
          .upsert(row, { onConflict: 'audition_scene_id,sequence_index' });

        if (upsertError) throw upsertError;
        generatedCount += 1;
      } catch (generationError) {
        const row = {
          id: existing?.id ?? randomUUID(),
          audition_script_id: input.audition.id,
          audition_scene_id: scene.id,
          sequence_index: runtimeLine.sequenceIndex,
          role_name: runtimeLine.roleName,
          line_text: runtimeLine.text,
          voice_persona_id: voiceId,
          voice_persona_label: formatVoicePersonaLabel(voiceId),
          status: 'failed' as const,
          storage_key: null,
          content_type: null,
          byte_length: null,
          request_payload: { voiceId },
          response_payload: {},
          error_message: generationError instanceof Error ? generationError.message : 'Level 1 audio generation failed',
          generated_at: null,
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await input.admin
          .from('audition_level1_audio_assets')
          .upsert(row, { onConflict: 'audition_scene_id,sequence_index' });

        if (upsertError) throw upsertError;
      }
    }
  }

  return {
    generatedCount,
    reusedCount,
    sceneCount: targetScenes.length,
  };
}

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistSyntheticAudioToR2 } from './storage';
import type { GenerationLineInterpretation, GenerationSourceLine } from './types';
import { synthesizeWithXaiTts } from './xai';
import type { AIProfile, AIVoiceVerificationSample } from '@/lib/types';

export const VOICE_VERIFICATION_SAMPLE_TEXT =
  'Take a steady breath, settle into the room, and speak this line with calm confidence.';

function buildVoiceVerificationStorageKey(input: {
  scriptId: string;
  aiProfileId: string;
  sampleId: string;
  fileExtension: string;
}) {
  const safeExtension = input.fileExtension.replace(/^\./, '') || 'mp3';
  return `generation/voice-checks/${input.scriptId}/${input.aiProfileId}/${input.sampleId}.${safeExtension}`;
}

function buildVerificationLine(scriptId: string): GenerationSourceLine {
  return {
    id: 'voice-verification-line',
    scriptId,
    sceneId: 'voice-verification-scene',
    sceneHeading: 'Voice Verification',
    sceneMetadata: null,
    chunkIndex: 0,
    chunkInScene: 1,
    type: 'dialogue',
    character: 'Voice Audit',
    ttsText: VOICE_VERIFICATION_SAMPLE_TEXT,
    chunkText: VOICE_VERIFICATION_SAMPLE_TEXT,
    isSystem: false,
  };
}

function buildVerificationInterpretation(): GenerationLineInterpretation {
  return {
    interpretationSource: 'fallback_heuristic',
    pauseBeforeMs: 0,
    pauseAfterMs: 0,
    emotionTags: ['calm'],
    deliveryNotes: ['Use a neutral studio delivery for comparison across voices.'],
    continuityNotes: [],
    emphasisNotes: [],
    promptSummary: 'Canonical voice verification line',
  };
}

export async function loadAiProfileForVerification(
  admin: SupabaseClient,
  profileId: string
): Promise<AIProfile> {
  const { data, error } = await admin
    .from('ai_profiles')
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .eq('id', profileId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'AI profile not found');
  }

  return data as AIProfile;
}

export async function createVoiceVerificationSample(input: {
  admin: SupabaseClient;
  profile: AIProfile;
  apiKey: string;
}): Promise<AIVoiceVerificationSample> {
  const sampleId = randomUUID();
  const line = buildVerificationLine(input.profile.script_id);
  const interpretation = buildVerificationInterpretation();

  try {
    const synthesis = await synthesizeWithXaiTts({
      apiKey: input.apiKey,
      line,
      interpretation,
      voicePersonaId: input.profile.voice_persona_id,
    });

    const storageKey = buildVoiceVerificationStorageKey({
      scriptId: input.profile.script_id,
      aiProfileId: input.profile.id,
      sampleId,
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

    const { data, error } = await input.admin
      .from('ai_voice_verification_samples')
      .insert({
        id: sampleId,
        ai_profile_id: input.profile.id,
        script_id: input.profile.script_id,
        status: 'ready',
        sample_text: VOICE_VERIFICATION_SAMPLE_TEXT,
        requested_voice_persona_id: input.profile.voice_persona_id,
        resolved_voice_id: (synthesis.responsePayload.voiceId as string | undefined) ?? input.profile.voice_persona_id,
        expressive_text: synthesis.expressiveText,
        storage_key: storageKey,
        content_type: synthesis.contentType,
        byte_length: synthesis.audioBytes.byteLength,
        request_payload: synthesis.requestPayload,
        response_payload: synthesis.responsePayload,
        error_message: null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to save voice verification sample');
    }

    return data as AIVoiceVerificationSample;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice verification failed';

    const { data, error: insertError } = await input.admin
      .from('ai_voice_verification_samples')
      .insert({
        id: sampleId,
        ai_profile_id: input.profile.id,
        script_id: input.profile.script_id,
        status: 'failed',
        sample_text: VOICE_VERIFICATION_SAMPLE_TEXT,
        requested_voice_persona_id: input.profile.voice_persona_id,
        resolved_voice_id: input.profile.voice_persona_id,
        expressive_text: null,
        storage_key: null,
        content_type: null,
        byte_length: null,
        request_payload: {
          requestedVoicePersonaId: input.profile.voice_persona_id,
        },
        response_payload: {},
        error_message: message,
      })
      .select('*')
      .single();

    if (insertError || !data) {
      throw new Error(insertError?.message ?? message);
    }

    return data as AIVoiceVerificationSample;
  }
}

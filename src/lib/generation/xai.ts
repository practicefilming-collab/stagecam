import type {
  GenerationLineInterpretation,
  GenerationProfile,
  GenerationSourceLine,
} from './types';
import { normalizeVoicePersonaId } from './voices';

export interface XaiTtsResult {
  audioBytes: Uint8Array;
  contentType: string;
  fileExtension: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  expressiveText: string;
}

export interface XaiInterpretationResult {
  interpretation: GenerationLineInterpretation;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inferFileExtension(contentType: string | null): string {
  if (!contentType) return 'mp3';
  const lowered = contentType.toLowerCase();
  if (lowered.includes('wav')) return 'wav';
  if (lowered.includes('mpeg') || lowered.includes('mp3')) return 'mp3';
  if (lowered.includes('pcm')) return 'pcm';
  return 'mp3';
}

function applyInterpretationTags(
  text: string,
  interpretation: GenerationLineInterpretation
): string {
  let output = text.trim();
  const tags: string[] = [];

  if (interpretation.pauseBeforeMs >= 900) {
    tags.push('[long-pause]');
  } else if (interpretation.pauseBeforeMs >= 250) {
    tags.push('[pause]');
  }

  if (interpretation.emotionTags.includes('urgent')) {
    output = `<build-intensity>${output}</build-intensity>`;
  } else if (interpretation.emotionTags.includes('hesitant')) {
    output = `<slow>${output}</slow>`;
  } else if (interpretation.emotionTags.includes('quiet')) {
    output = `<whisper>${output}</whisper>`;
  } else if (interpretation.emotionTags.includes('intense')) {
    output = `<emphasis>${output}</emphasis>`;
  }

  if (interpretation.emotionTags.includes('warm')) {
    output = `[sigh] ${output}`;
  }
  if (interpretation.emotionTags.includes('playful')) {
    output = `[laugh] ${output}`;
  }

  if (interpretation.pauseAfterMs >= 900) {
    output = `${output} [long-pause]`;
  } else if (interpretation.pauseAfterMs >= 250) {
    output = `${output} [pause]`;
  }

  return `${tags.join(' ')} ${output}`.trim();
}

function parseJsonMessageContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function coerceInterpretation(value: unknown): GenerationLineInterpretation {
  if (!value || typeof value !== 'object') {
    throw new Error('Interpretation payload was not an object.');
  }

  const raw = value as Record<string, unknown>;
  const promptSummary = typeof raw.promptSummary === 'string' ? raw.promptSummary.trim() : '';
  if (!promptSummary) {
    throw new Error('Interpretation payload did not include promptSummary.');
  }

  return {
    interpretationSource: 'xai_grok',
    pauseBeforeMs: clamp(typeof raw.pauseBeforeMs === 'number' ? raw.pauseBeforeMs : 0, 0, 1500),
    pauseAfterMs: clamp(typeof raw.pauseAfterMs === 'number' ? raw.pauseAfterMs : 0, 0, 1500),
    emotionTags: ensureStringArray(raw.emotionTags),
    deliveryNotes: ensureStringArray(raw.deliveryNotes),
    continuityNotes: ensureStringArray(raw.continuityNotes),
    emphasisNotes: ensureStringArray(raw.emphasisNotes),
    promptSummary,
  };
}

export async function interpretWithXai(input: {
  apiKey: string;
  line: GenerationSourceLine;
  contextLines: GenerationSourceLine[];
  profile: GenerationProfile;
  roleBrief: Record<string, unknown> | null;
}): Promise<XaiInterpretationResult> {
  const apiKey = input.apiKey.trim();
  const sceneMetadata = input.line.sceneMetadata ?? {};
  const model = process.env.XAI_CHAT_MODEL ?? 'grok-4.20-reasoning';
  const sceneObjective = typeof sceneMetadata.sceneObjective === 'string' ? sceneMetadata.sceneObjective : '';
  const dramaticPurpose = typeof sceneMetadata.dramaticPurpose === 'string' ? sceneMetadata.dramaticPurpose : '';
  const emotionalTemperature = typeof sceneMetadata.emotionalTemperature === 'string' ? sceneMetadata.emotionalTemperature : '';
  const subtext = typeof sceneMetadata.subtext === 'string' ? sceneMetadata.subtext : '';
  const rehearsalEmphasis = typeof sceneMetadata.rehearsalEmphasis === 'string' ? sceneMetadata.rehearsalEmphasis : '';
  const roleBriefText = input.roleBrief
    ? JSON.stringify(input.roleBrief)
    : 'No extra role brief provided.';
  const contextText = input.contextLines
    .map((line) => `${line.character ?? line.type.toUpperCase()}: ${line.ttsText ?? line.chunkText}`)
    .join('\n');

  const schema = {
    name: 'line_interpretation',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pauseBeforeMs: { type: 'integer' },
        pauseAfterMs: { type: 'integer' },
        emotionTags: {
          type: 'array',
          items: { type: 'string' },
        },
        deliveryNotes: {
          type: 'array',
          items: { type: 'string' },
        },
        continuityNotes: {
          type: 'array',
          items: { type: 'string' },
        },
        emphasisNotes: {
          type: 'array',
          items: { type: 'string' },
        },
        promptSummary: { type: 'string' },
      },
      required: [
        'pauseBeforeMs',
        'pauseAfterMs',
        'emotionTags',
        'deliveryNotes',
        'continuityNotes',
        'emphasisNotes',
        'promptSummary',
      ],
    },
  };

  const requestPayload = {
    model,
    temperature: 0.2,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: schema,
    },
    messages: [
      {
        role: 'system',
        content:
          'You are a performance direction engine for spoken rehearsal audio. Return only JSON matching the schema. Keep pauses realistic, tone playable, and notes concise.',
      },
      {
        role: 'user',
        content: [
          `Role: ${input.profile.displayName}`,
          `Voice persona: ${input.profile.voicePersonaId ?? 'unknown'}`,
          `Scene heading: ${input.line.sceneHeading ?? 'Unknown scene'}`,
          `Scene objective: ${sceneObjective}`,
          `Dramatic purpose: ${dramaticPurpose}`,
          `Emotional temperature: ${emotionalTemperature}`,
          `Subtext: ${subtext}`,
          `Rehearsal emphasis: ${rehearsalEmphasis}`,
          `Role brief: ${roleBriefText}`,
          `Context:\n${contextText}`,
          `Current line type: ${input.line.type}`,
          `Current speaker: ${input.line.character ?? 'narration'}`,
          `Current line text: ${(input.line.ttsText ?? input.line.chunkText).trim()}`,
          'Produce delivery guidance that sounds intentional but still natural for a rehearsal read.',
        ].join('\n\n'),
      },
    ],
  };

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`xAI interpretation failed (${response.status}): ${bodyText || response.statusText}`);
  }

  const responsePayload = (await response.json()) as Record<string, unknown>;
  const content = parseJsonMessageContent(
    ((responsePayload.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message?.content) ?? '',
  );
  const parsed = coerceInterpretation(JSON.parse(content));

  return {
    interpretation: parsed,
    requestPayload,
    responsePayload,
  };
}

export async function synthesizeWithXaiTts(input: {
  apiKey: string;
  line: GenerationSourceLine;
  interpretation: GenerationLineInterpretation;
  voicePersonaId: string | null;
}): Promise<XaiTtsResult> {
  const apiKey = input.apiKey.trim();
  const voiceId = normalizeVoicePersonaId(input.voicePersonaId) ?? 'eve';
  const expressiveText = applyInterpretationTags(
    (input.line.ttsText ?? input.line.chunkText).trim(),
    input.interpretation
  );

  const requestPayload = {
    text: expressiveText,
    voice_id: voiceId,
    language: 'en-US',
    output_format: {
      codec: 'mp3',
      sample_rate: 24000,
      bit_rate: 128000,
    },
  };

  const response = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`xAI TTS failed (${response.status}): ${bodyText || response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'audio/mpeg';

  return {
    audioBytes: new Uint8Array(await response.arrayBuffer()),
    contentType,
    fileExtension: inferFileExtension(contentType),
    requestPayload,
    responsePayload: {
      contentType,
      contentLength: response.headers.get('content-length'),
      voiceId,
    },
    expressiveText,
  };
}

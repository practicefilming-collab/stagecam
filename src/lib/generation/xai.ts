import type { GenerationLineInterpretation, GenerationSourceLine } from './types';
import { normalizeVoicePersonaId } from './voices';

export interface XaiTtsResult {
  audioBytes: Uint8Array;
  contentType: string;
  fileExtension: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  expressiveText: string;
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
  } else if (interpretation.emotionTags.includes('intense')) {
    output = `<emphasis>${output}</emphasis>`;
  }

  if (interpretation.pauseAfterMs >= 900) {
    output = `${output} [long-pause]`;
  } else if (interpretation.pauseAfterMs >= 250) {
    output = `${output} [pause]`;
  }

  return `${tags.join(' ')} ${output}`.trim();
}

export async function synthesizeWithXaiTts(input: {
  apiKey: string;
  line: GenerationSourceLine;
  interpretation: GenerationLineInterpretation;
  voicePersonaId: string | null;
}): Promise<XaiTtsResult> {
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
      Authorization: `Bearer ${input.apiKey}`,
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

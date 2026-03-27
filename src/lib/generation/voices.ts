export const XAI_TTS_VOICES = ['eve', 'ara', 'rex', 'sal', 'leo'] as const;

export type XaiTtsVoiceId = (typeof XAI_TTS_VOICES)[number];

export function normalizeVoicePersonaId(value: string | null | undefined): XaiTtsVoiceId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (XAI_TTS_VOICES as readonly string[]).includes(normalized)
    ? (normalized as XaiTtsVoiceId)
    : null;
}

export function formatVoicePersonaLabel(voiceId: string | null | undefined): string | null {
  const normalized = normalizeVoicePersonaId(voiceId);
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

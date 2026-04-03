import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClipPracticeMode, ClipSpeedLevel } from '@/lib/types';
import { CLIP_SPEED_TIERS, CLIP_PRACTICE_MODE_ORDER } from '@/lib/constants';

/**
 * Determine the next step in the progression sequence after a pass.
 *
 * Progression order:
 *   guided_audio_mixed: 0.60x -> 0.75x -> 0.90x -> 1.00x
 *   guided_audio_clean: 0.60x -> 0.75x -> 0.90x -> 1.00x
 *   response_recall: 1.00x
 *   freestyle_variation: 1.00x (optional)
 */
export function getNextStep(
  currentMode: ClipPracticeMode,
  currentSpeed: ClipSpeedLevel,
): { mode: ClipPracticeMode; speed: ClipSpeedLevel } | null {
  const speedIndex = CLIP_SPEED_TIERS.indexOf(currentSpeed);
  const modeIndex = CLIP_PRACTICE_MODE_ORDER.indexOf(currentMode);

  // If there's a next speed tier in the current mode (for guided modes)
  if (
    (currentMode === 'guided_audio_mixed' || currentMode === 'guided_audio_clean') &&
    speedIndex < CLIP_SPEED_TIERS.length - 1
  ) {
    return {
      mode: currentMode,
      speed: CLIP_SPEED_TIERS[speedIndex + 1],
    };
  }

  // If at 1.00x, advance to next mode
  if (currentMode === 'guided_audio_mixed') {
    return { mode: 'guided_audio_clean', speed: '0.60x' };
  }

  if (currentMode === 'guided_audio_clean') {
    return { mode: 'response_recall', speed: '1.00x' };
  }

  if (currentMode === 'response_recall') {
    return { mode: 'freestyle_variation', speed: '1.00x' };
  }

  // freestyle_variation is the end
  return null;
}

/**
 * Check whether a segment is fully complete for a user.
 *
 * Requires all guided_audio_mixed tiers + all guided_audio_clean tiers
 * + response_recall at 1.00x to be passed.
 */
export async function isSegmentComplete(
  supabase: SupabaseClient,
  userId: string,
  segmentId: string,
): Promise<{ complete: boolean; conditionallyAdvanced: boolean; hasSkippedClean: boolean }> {
  const { data: attempts } = await supabase
    .from('clip_attempts')
    .select('practice_mode, speed_level, pass_result, step_status')
    .eq('user_id', userId)
    .eq('segment_id', segmentId)
    .eq('pass_result', true);

  if (!attempts) {
    return { complete: false, conditionallyAdvanced: false, hasSkippedClean: false };
  }

  const passed = new Set(
    attempts.map((a) => `${a.practice_mode}:${a.speed_level}`),
  );

  // Check all guided_audio_mixed tiers
  const mixedComplete = CLIP_SPEED_TIERS.every(
    (tier) => passed.has(`guided_audio_mixed:${tier}`),
  );

  // Check all guided_audio_clean tiers
  const cleanComplete = CLIP_SPEED_TIERS.every(
    (tier) => passed.has(`guided_audio_clean:${tier}`),
  );

  // Check response_recall
  const recallComplete = passed.has('response_recall:1.00x');

  // Check for skipped clean steps
  const hasSkippedClean = attempts.some(
    (a) => a.step_status === 'skipped' && a.practice_mode === 'guided_audio_clean',
  );

  const complete = mixedComplete && cleanComplete && recallComplete;
  const conditionallyAdvanced = mixedComplete && !cleanComplete && recallComplete && hasSkippedClean;

  return { complete, conditionallyAdvanced, hasSkippedClean };
}

/**
 * Calculate clip completion percentage for a user.
 */
export async function getClipCompletion(
  supabase: SupabaseClient,
  userId: string,
  clipId: string,
): Promise<{ completedSegments: number; totalSegments: number; percentage: number }> {
  const { data: segments } = await supabase
    .from('clip_segments')
    .select('id')
    .eq('clip_id', clipId)
    .eq('is_active', true);

  if (!segments || segments.length === 0) {
    return { completedSegments: 0, totalSegments: 0, percentage: 0 };
  }

  let completedCount = 0;
  for (const seg of segments) {
    const { complete } = await isSegmentComplete(supabase, userId, seg.id);
    if (complete) completedCount++;
  }

  return {
    completedSegments: completedCount,
    totalSegments: segments.length,
    percentage: Math.round((completedCount / segments.length) * 100),
  };
}

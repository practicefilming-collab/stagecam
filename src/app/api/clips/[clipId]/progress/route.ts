import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isSegmentComplete, getClipCompletion, getNextStep } from '@/lib/clips/progression';
import type { ClipPracticeMode, ClipSpeedLevel } from '@/lib/types';
import { CLIP_SPEED_TIERS, CLIP_PRACTICE_MODE_ORDER } from '@/lib/constants';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get segments
  const { data: segments } = await supabase
    .from('clip_segments')
    .select('id, display_label, is_active')
    .eq('clip_id', clipId)
    .eq('is_active', true)
    .order('ordering_index');

  if (!segments || segments.length === 0) {
    return NextResponse.json({
      segments: [],
      completion: { completed: 0, total: 0, percentage: 0 },
      currentStep: { mode: 'guided_audio_mixed', speed: '0.60x' },
    });
  }

  // Get segment completion status
  const segmentStatuses = await Promise.all(
    segments.map(async (seg) => {
      const status = await isSegmentComplete(supabase, user.id, seg.id);
      return {
        id: seg.id,
        label: seg.display_label,
        ...status,
      };
    }),
  );

  // Get overall completion
  const completion = await getClipCompletion(supabase, user.id, clipId);

  // Determine current step from highest passed attempt
  const { data: passedAttempts } = await supabase
    .from('clip_attempts')
    .select('practice_mode, speed_level')
    .eq('clip_id', clipId)
    .eq('user_id', user.id)
    .eq('pass_result', true)
    .order('started_at', { ascending: false });

  let currentStep: { mode: ClipPracticeMode; speed: ClipSpeedLevel } = {
    mode: 'guided_audio_mixed',
    speed: '0.60x',
  };

  if (passedAttempts && passedAttempts.length > 0) {
    // Find the highest passed step and compute next
    let highestModeIndex = -1;
    let highestSpeedIndex = -1;

    for (const attempt of passedAttempts) {
      const mi = CLIP_PRACTICE_MODE_ORDER.indexOf(attempt.practice_mode as ClipPracticeMode);
      const si = CLIP_SPEED_TIERS.indexOf(attempt.speed_level as ClipSpeedLevel);

      if (mi > highestModeIndex || (mi === highestModeIndex && si > highestSpeedIndex)) {
        highestModeIndex = mi;
        highestSpeedIndex = si;
      }
    }

    if (highestModeIndex >= 0 && highestSpeedIndex >= 0) {
      const highestMode = CLIP_PRACTICE_MODE_ORDER[highestModeIndex];
      const highestSpeed = CLIP_SPEED_TIERS[highestSpeedIndex];
      const next = getNextStep(highestMode, highestSpeed);
      if (next) {
        currentStep = next;
      }
    }
  }

  return NextResponse.json({
    segments: segmentStatuses,
    completion,
    currentStep,
  });
}

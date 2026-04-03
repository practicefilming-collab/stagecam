import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { scoreAttempt, weakestDimension } from '@/lib/clips/scoring';
import type { ClipContentType, ClipSpeedLevel, ClipPracticeMode } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clipId: string; attemptId: string }> },
) {
  const { clipId, attemptId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { timing_score, rhythm_score, energy_score, completion_confidence_score } = body;

  if (timing_score == null || rhythm_score == null || energy_score == null || completion_confidence_score == null) {
    return NextResponse.json({ error: 'All four dimension scores are required' }, { status: 400 });
  }

  // Fetch attempt
  const { data: attempt, error: attemptError } = await supabase
    .from('clip_attempts')
    .select('id, user_id, practice_mode, speed_level, clip_id')
    .eq('id', attemptId)
    .eq('clip_id', clipId)
    .eq('user_id', user.id)
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }

  // Fetch clip content type
  const { data: clip } = await supabase
    .from('clips')
    .select('content_type')
    .eq('id', clipId)
    .single();

  if (!clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  // Calculate score
  const dimensions = { timing: timing_score, rhythm: rhythm_score, energy: energy_score, completion_confidence: completion_confidence_score };
  const result = scoreAttempt(
    dimensions,
    clip.content_type as ClipContentType,
    attempt.speed_level as ClipSpeedLevel,
    attempt.practice_mode as ClipPracticeMode,
  );

  const weakest = weakestDimension(dimensions);

  // Persist scores to attempt record
  const { data: updated, error: updateError } = await supabase
    .from('clip_attempts')
    .update({
      timing_score: result.timing_score,
      rhythm_score: result.rhythm_score,
      energy_score: result.energy_score,
      completion_confidence_score: result.completion_confidence_score,
      overall_score: result.overall_score,
      pass_result: result.pass_result,
      content_type_grading_profile: result.content_type_grading_profile,
      processing_status: 'scored',
      completed_at: new Date().toISOString(),
      step_status: result.pass_result ? 'completed' : 'available',
    })
    .eq('id', attemptId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    attempt: updated,
    score: result,
    feedback: {
      weakest_dimension: weakest.name,
      weakest_score: weakest.score,
    },
  });
}

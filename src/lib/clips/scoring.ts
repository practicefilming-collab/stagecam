import type { ClipContentType, ClipSpeedLevel, ClipPracticeMode } from '@/lib/types';
import {
  CLIP_SCORING_PROFILES,
  CLIP_PASS_THRESHOLDS,
  CLIP_RECALL_MINIMUMS,
  CLIP_FREESTYLE_THRESHOLD,
} from '@/lib/constants';

export interface ScoreDimensions {
  timing: number;
  rhythm: number;
  energy: number;
  completion_confidence: number;
}

export interface ScoreResult {
  timing_score: number;
  rhythm_score: number;
  energy_score: number;
  completion_confidence_score: number;
  overall_score: number;
  pass_result: boolean;
  content_type_grading_profile: string;
}

/**
 * Calculate the overall score from individual dimension scores
 * using the content-type-specific weight profile.
 */
export function calculateOverallScore(
  dimensions: ScoreDimensions,
  contentType: ClipContentType,
): number {
  const profile = CLIP_SCORING_PROFILES[contentType] ?? CLIP_SCORING_PROFILES.mixed;

  const overall =
    dimensions.timing * profile.timing +
    dimensions.rhythm * profile.rhythm +
    dimensions.energy * profile.energy +
    dimensions.completion_confidence * profile.completion_confidence;

  return Math.round(overall * 100) / 100;
}

/**
 * Determine whether an attempt passes based on score, speed tier, and practice mode.
 */
export function evaluatePass(
  dimensions: ScoreDimensions,
  overallScore: number,
  speedLevel: ClipSpeedLevel,
  practiceMode: ClipPracticeMode,
): boolean {
  // Freestyle has relaxed rules
  if (practiceMode === 'freestyle_variation') {
    return overallScore >= CLIP_FREESTYLE_THRESHOLD.overall_min;
  }

  const thresholds = CLIP_PASS_THRESHOLDS[speedLevel];
  if (!thresholds) return false;

  // Check overall minimum
  if (overallScore < thresholds.overall_min) return false;

  // Check dimension floor
  if (
    dimensions.timing < thresholds.dimension_floor ||
    dimensions.rhythm < thresholds.dimension_floor ||
    dimensions.energy < thresholds.dimension_floor ||
    dimensions.completion_confidence < thresholds.dimension_floor
  ) {
    return false;
  }

  // Additional minimums for response_recall
  if (practiceMode === 'response_recall') {
    if (dimensions.rhythm < CLIP_RECALL_MINIMUMS.rhythm) return false;
    if (dimensions.energy < CLIP_RECALL_MINIMUMS.energy) return false;
  }

  return true;
}

/**
 * Score an attempt and return the full result.
 */
export function scoreAttempt(
  dimensions: ScoreDimensions,
  contentType: ClipContentType,
  speedLevel: ClipSpeedLevel,
  practiceMode: ClipPracticeMode,
): ScoreResult {
  const overall = calculateOverallScore(dimensions, contentType);
  const pass = evaluatePass(dimensions, overall, speedLevel, practiceMode);

  return {
    timing_score: dimensions.timing,
    rhythm_score: dimensions.rhythm,
    energy_score: dimensions.energy,
    completion_confidence_score: dimensions.completion_confidence,
    overall_score: overall,
    pass_result: pass,
    content_type_grading_profile: contentType,
  };
}

/**
 * Identify the weakest scoring dimension for feedback.
 */
export function weakestDimension(dimensions: ScoreDimensions): { name: string; score: number } {
  const entries: [string, number][] = [
    ['timing', dimensions.timing],
    ['rhythm', dimensions.rhythm],
    ['energy', dimensions.energy],
    ['completion confidence', dimensions.completion_confidence],
  ];

  entries.sort((a, b) => a[1] - b[1]);
  return { name: entries[0][0], score: entries[0][1] };
}

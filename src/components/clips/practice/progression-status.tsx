'use client';

import type { ClipPracticeMode, ClipSpeedLevel } from '@/lib/types';
import { CLIP_SPEED_TIERS, CLIP_PRACTICE_MODE_ORDER } from '@/lib/constants';

interface ProgressionStatusProps {
  currentMode: ClipPracticeMode;
  currentSpeed: ClipSpeedLevel;
  completionPercentage: number;
}

const MODE_LABELS: Record<string, string> = {
  guided_audio_mixed: 'Guided Mixed',
  guided_audio_clean: 'Clean Mimic',
  response_recall: 'Recall',
  freestyle_variation: 'Freestyle',
};

export default function ProgressionStatus({
  currentMode,
  currentSpeed,
  completionPercentage,
}: ProgressionStatusProps) {
  const currentModeIndex = CLIP_PRACTICE_MODE_ORDER.indexOf(currentMode);
  const currentSpeedIndex = CLIP_SPEED_TIERS.indexOf(currentSpeed);

  // Build step sequence for visual indicator
  const steps: { mode: string; speed: string; isCurrent: boolean; isPast: boolean }[] = [];

  for (let mi = 0; mi < CLIP_PRACTICE_MODE_ORDER.length; mi++) {
    const mode = CLIP_PRACTICE_MODE_ORDER[mi];
    // guided modes have 4 speed tiers, recall + freestyle are 1.00x only
    const speeds = (mode === 'guided_audio_mixed' || mode === 'guided_audio_clean')
      ? CLIP_SPEED_TIERS
      : ['1.00x' as const];

    for (let si = 0; si < speeds.length; si++) {
      const speed = speeds[si];
      const isPast = mi < currentModeIndex || (mi === currentModeIndex && si < currentSpeedIndex);
      const isCurrent = mi === currentModeIndex && speed === currentSpeed;
      steps.push({
        mode: MODE_LABELS[mode] ?? mode,
        speed,
        isCurrent,
        isPast,
      });
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-muted">Current Step</p>
          <p className="text-sm font-medium">
            {MODE_LABELS[currentMode] ?? currentMode} @ {currentSpeed}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Completion</p>
          <p className="text-sm font-bold text-gold">{completionPercentage}%</p>
        </div>
      </div>

      {/* Step dots */}
      <div className="flex gap-1 flex-wrap">
        {steps.map((step, i) => (
          <div
            key={i}
            title={`${step.mode} @ ${step.speed}`}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              step.isCurrent
                ? 'bg-gold ring-2 ring-gold/30'
                : step.isPast
                  ? 'bg-green-400'
                  : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

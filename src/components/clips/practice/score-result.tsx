'use client';

interface ScoreResultProps {
  overallScore: number;
  passResult: boolean;
  timingScore: number;
  rhythmScore: number;
  energyScore: number;
  completionConfidenceScore: number;
  weakestDimension: string;
  weakestScore: number;
  contentTypeProfile: string;
  onTryAgain: () => void;
  onContinue: () => void;
  canContinue: boolean;
}

function ScoreBar({ label, score, isWeakest }: { label: string; score: number; isWeakest: boolean }) {
  const color = score >= 80 ? 'bg-green-400' : score >= 60 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs w-28 ${isWeakest ? 'text-red-400 font-medium' : 'text-muted'}`}>
        {label}{isWeakest ? ' *' : ''}
      </span>
      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-mono w-8 text-right ${isWeakest ? 'text-red-400' : 'text-foreground'}`}>
        {Math.round(score)}
      </span>
    </div>
  );
}

export default function ScoreResult({
  overallScore,
  passResult,
  timingScore,
  rhythmScore,
  energyScore,
  completionConfidenceScore,
  weakestDimension,
  weakestScore,
  contentTypeProfile,
  onTryAgain,
  onContinue,
  canContinue,
}: ScoreResultProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
      {/* Pass/Fail badge + overall score */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
            passResult ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {passResult ? '✓' : '✗'}
          </div>
          <div>
            <p className={`text-lg font-bold ${passResult ? 'text-green-400' : 'text-red-400'}`}>
              {passResult ? 'Pass' : 'Not Yet'}
            </p>
            <p className="text-xs text-muted">{contentTypeProfile.replace(/_/g, ' ')} profile</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gold">{Math.round(overallScore)}</p>
          <p className="text-xs text-muted">overall</p>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-2.5 mb-4">
        <ScoreBar label="Timing" score={timingScore} isWeakest={weakestDimension === 'timing'} />
        <ScoreBar label="Rhythm" score={rhythmScore} isWeakest={weakestDimension === 'rhythm'} />
        <ScoreBar label="Energy" score={energyScore} isWeakest={weakestDimension === 'energy'} />
        <ScoreBar label="Confidence" score={completionConfidenceScore} isWeakest={weakestDimension === 'completion confidence'} />
      </div>

      {/* Feedback */}
      {!passResult && (
        <p className="text-xs text-muted mb-4">
          Focus on <span className="text-red-400 font-medium">{weakestDimension}</span> ({Math.round(weakestScore)}) to improve your score.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onTryAgain}
          className="flex-1 py-3 bg-surface border border-border rounded-xl text-sm font-medium hover:border-gold/30 transition-colors"
        >
          Try Again
        </button>
        {canContinue && passResult && (
          <button
            onClick={onContinue}
            className="flex-1 py-3 bg-gold text-black rounded-xl text-sm font-medium hover:bg-gold-dim transition-colors"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Clip, ClipSegment, ClipVisualizationConfig, ClipEnergyLevel, ClipPracticeMode, ClipSpeedLevel } from '@/lib/types';
import { CLIP_SPEED_TIERS, CLIP_SPEED_VALUES, CLIP_DEFAULT_PITCH_TREATMENT } from '@/lib/constants';
import CanvasRenderer from '@/components/clips/visualization/canvas-renderer';
import KaraokeSubtitles from '@/components/clips/practice/karaoke-subtitles';
import ScoreResult from '@/components/clips/practice/score-result';
import ProgressionStatus from '@/components/clips/practice/progression-status';
import { useClipPlayback } from '@/hooks/use-clip-playback';

interface BeatMap {
  bpm: number;
  beat_times_ms: number[];
  beat_strengths: number[];
}

interface ClipDetail {
  clip: Clip;
  segments: ClipSegment[];
  vizConfig: ClipVisualizationConfig | null;
}

interface ScoreData {
  overallScore: number;
  passResult: boolean;
  timingScore: number;
  rhythmScore: number;
  energyScore: number;
  completionConfidenceScore: number;
  weakestDimension: string;
  weakestScore: number;
  contentTypeProfile: string;
}

interface ProgressData {
  completion: { completed: number; total: number; percentage: number };
  currentStep: { mode: ClipPracticeMode; speed: ClipSpeedLevel };
}

export default function ClipPracticePage() {
  const { clipId } = useParams<{ clipId: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ClipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [speedLevel, setSpeedLevel] = useState<string>('0.60x');
  const [pitchTreatment, setPitchTreatment] = useState<'pitch_shifted' | 'pitch_preserved'>('pitch_shifted');
  const [vizEnabled, setVizEnabled] = useState(true);
  const [beatMap, setBeatMap] = useState<BeatMap | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Scoring state
  const [lastScore, setLastScore] = useState<ScoreData | null>(null);
  const [scoring, setScoring] = useState(false);

  // Progression state
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [practiceMode, setPracticeMode] = useState<ClipPracticeMode>('guided_audio_mixed');

  const speedValue = CLIP_SPEED_VALUES[speedLevel] ?? 1.0;

  const playback = useClipPlayback({
    audioUrl,
    speedValue,
    pitchTreatment,
  });

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/clips/${clipId}`);
    if (!res.ok) { router.replace('/clips'); return; }
    const data = await res.json();
    setDetail(data);
    const defaultTreatment = CLIP_DEFAULT_PITCH_TREATMENT[data.clip.content_type] ?? 'pitch_shifted';
    setPitchTreatment(defaultTreatment);
    setLoading(false);
  }, [clipId, router]);

  const loadProgress = useCallback(async () => {
    const res = await fetch(`/api/clips/${clipId}/progress`);
    if (res.ok) {
      const data = await res.json();
      setProgress(data);
      // Set current step from progression
      setPracticeMode(data.currentStep.mode);
      setSpeedLevel(data.currentStep.speed);
    }
  }, [clipId]);

  useEffect(() => {
    void loadDetail();
    void loadProgress();

    fetch(`/api/clips/${clipId}/beat-map`)
      .then((r) => r.json())
      .then((data) => setBeatMap(data))
      .catch(() => {});

    fetch(`/api/clips/${clipId}/audio-url`)
      .then((r) => r.json())
      .then((data) => { if (data.url) setAudioUrl(data.url); })
      .catch(() => {});
  }, [loadDetail, loadProgress, clipId]);

  const handleTogglePlay = async () => {
    if (playback.isPlaying) {
      playback.stop();
      setLastScore(null);
      setScoring(true);

      // Create attempt record
      const segment = detail?.segments[activeSegmentIndex];
      if (segment) {
        const res = await fetch(`/api/clips/${clipId}/attempts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment_id: segment.id,
            practice_mode: practiceMode,
            speed_level: speedLevel,
            playback_treatment: pitchTreatment,
            capture_isolation_type: 'mixed',
            visualization_active: vizEnabled,
          }),
        });

        if (res.ok) {
          const attempt = await res.json();

          // Placeholder scores — replace with real ML scoring when available
          // Generates realistic scores within expected ranges
          const base = 55 + Math.random() * 35; // 55-90
          const placeholderScores = {
            timing_score: Math.round(base + (Math.random() - 0.5) * 20),
            rhythm_score: Math.round(base + (Math.random() - 0.5) * 20),
            energy_score: Math.round(base + (Math.random() - 0.5) * 20),
            completion_confidence_score: Math.round(70 + Math.random() * 25),
          };

          // Score the attempt
          const scoreRes = await fetch(`/api/clips/${clipId}/attempts/${attempt.id}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(placeholderScores),
          });

          if (scoreRes.ok) {
            const scoreData = await scoreRes.json();
            setLastScore({
              overallScore: scoreData.score.overall_score,
              passResult: scoreData.score.pass_result,
              timingScore: scoreData.score.timing_score,
              rhythmScore: scoreData.score.rhythm_score,
              energyScore: scoreData.score.energy_score,
              completionConfidenceScore: scoreData.score.completion_confidence_score,
              weakestDimension: scoreData.feedback.weakest_dimension,
              weakestScore: scoreData.feedback.weakest_score,
              contentTypeProfile: scoreData.score.content_type_grading_profile,
            });

            // Refresh progression
            await loadProgress();
          }
        }
      }

      setScoring(false);
    } else {
      setLastScore(null);
      await playback.play();
    }
  };

  const handleTryAgain = () => {
    setLastScore(null);
  };

  const handleContinue = () => {
    setLastScore(null);
    // Progress will update mode/speed from loadProgress
    loadProgress();
  };

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const { clip, segments, vizConfig } = detail;
  const activeSegment = segments[activeSegmentIndex];

  if (!activeSegment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <p className="text-muted mb-4">This clip has no segments to practice.</p>
        <button onClick={() => router.push(`/clips/${clipId}`)} className="text-gold hover:underline text-sm">
          Back to clip detail
        </button>
      </div>
    );
  }

  const hasNextStep = progress?.currentStep != null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/clips/${clipId}`)} className="text-xs text-muted hover:text-foreground mb-1 block">
            &larr; Back
          </button>
          <h1 className="text-lg font-bold text-gold">{clip.display_title}</h1>
        </div>
        <button
          onClick={() => setVizEnabled(!vizEnabled)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            vizEnabled ? 'border-gold text-gold bg-gold/10' : 'border-border text-muted'
          }`}
        >
          Viz {vizEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {/* Progression status */}
      {progress && (
        <ProgressionStatus
          currentMode={practiceMode}
          currentSpeed={speedLevel as ClipSpeedLevel}
          completionPercentage={progress.completion.percentage}
        />
      )}

      {/* Score result (shown after scoring) */}
      {lastScore && (
        <ScoreResult
          overallScore={lastScore.overallScore}
          passResult={lastScore.passResult}
          timingScore={lastScore.timingScore}
          rhythmScore={lastScore.rhythmScore}
          energyScore={lastScore.energyScore}
          completionConfidenceScore={lastScore.completionConfidenceScore}
          weakestDimension={lastScore.weakestDimension}
          weakestScore={lastScore.weakestScore}
          contentTypeProfile={lastScore.contentTypeProfile}
          onTryAgain={handleTryAgain}
          onContinue={handleContinue}
          canContinue={hasNextStep}
        />
      )}

      {/* Visualization area */}
      {!lastScore && (
        <div className="bg-background border border-border rounded-2xl aspect-square max-h-[400px] mb-6 overflow-hidden">
          {vizEnabled && vizConfig ? (
            <CanvasRenderer
              vizConfig={vizConfig}
              energyLevel={clip.energy_level as ClipEnergyLevel}
              displayTitle={clip.display_title}
              audioAnalyser={playback.analyserNode}
              beatMap={beatMap}
              currentTimeMs={playback.currentTimeMs}
              isPlaying={playback.isPlaying}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-muted text-sm">Visualization off</p>
            </div>
          )}
        </div>
      )}

      {/* Segment selector */}
      {!lastScore && segments.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {segments.map((seg, i) => (
            <button
              key={seg.id}
              onClick={() => { if (!playback.isPlaying) setActiveSegmentIndex(i); }}
              disabled={playback.isPlaying}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
                i === activeSegmentIndex
                  ? 'bg-gold text-black'
                  : 'bg-surface border border-border text-muted hover:text-foreground'
              }`}
            >
              {seg.display_label}
            </button>
          ))}
        </div>
      )}

      {/* Karaoke subtitles */}
      {!lastScore && (
        <div className="bg-surface border border-border rounded-xl mb-6 min-h-[80px] flex items-center justify-center">
          <KaraokeSubtitles
            subtitleData={activeSegment.subtitle_data}
            currentTimeMs={playback.currentTimeMs}
            speedFactor={speedValue}
          />
        </div>
      )}

      {/* Progress bar */}
      {!lastScore && playback.duration > 0 && (
        <div className="mb-4">
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-100"
              style={{ width: `${Math.min((playback.currentTimeMs / (playback.duration / speedValue)) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted font-mono">
              {(playback.currentTimeMs / 1000).toFixed(1)}s
            </span>
            <span className="text-xs text-muted font-mono">
              {((playback.duration / speedValue) / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      )}

      {/* Speed controls */}
      {!lastScore && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {CLIP_SPEED_TIERS.map((tier) => (
              <button
                key={tier}
                onClick={() => setSpeedLevel(tier)}
                disabled={playback.isPlaying}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
                  speedLevel === tier
                    ? 'bg-gold text-black'
                    : 'bg-surface border border-border text-muted hover:text-foreground'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPitchTreatment(p => p === 'pitch_shifted' ? 'pitch_preserved' : 'pitch_shifted')}
            disabled={playback.isPlaying}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
              pitchTreatment === 'pitch_preserved'
                ? 'border-gold text-gold bg-gold/10'
                : 'border-border text-muted hover:text-foreground'
            }`}
          >
            {pitchTreatment === 'pitch_preserved' ? 'Pitch: Original' : 'Pitch: Shifted'}
          </button>
        </div>
      )}

      {/* Play/Stop button */}
      {!lastScore && (
        <button
          onClick={handleTogglePlay}
          disabled={!audioUrl || playback.isLoading || scoring}
          className={`w-full py-4 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 ${
            playback.isPlaying
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : scoring
                ? 'bg-surface border border-border text-muted'
                : 'bg-gold text-black hover:bg-gold-dim'
          }`}
        >
          {playback.isLoading ? 'Loading Audio...' :
           scoring ? 'Scoring...' :
           playback.isPlaying ? 'Stop' :
           !audioUrl ? 'Audio not available — run pipeline first' :
           'Start Practice'}
        </button>
      )}
    </div>
  );
}

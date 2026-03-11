'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SceneData {
  id: string;
  sceneNumber: number;
  sceneHeading: string | null;
  rehearsableLines: number;
  recordedLines: number;
  completionPct: number;
  rehearsalCount: number;
}

interface ActData {
  id: string;
  actNumber: number;
  completion: { totalRehearsableLines: number; recordedLines: number; percentage: number };
  scenes: SceneData[];
}

interface CoverageGridProps {
  acts: ActData[];
}

type GridMode = 'coverage' | 'rehearsals';

function getCoverageColor(pct: number): string {
  if (pct >= 100) return 'bg-green-600';
  if (pct > 0) return 'bg-gold';
  return 'bg-zinc-800';
}

function getRehearsalColor(count: number): string {
  if (count === 0) return 'bg-red-900/40';
  if (count <= 2) return 'bg-zinc-700';
  return 'bg-gold';
}

export default function CoverageGrid({ acts }: CoverageGridProps) {
  const [mode, setMode] = useState<GridMode>('coverage');

  // Rehearsal balance summary
  const allScenes = acts.flatMap((a) => a.scenes);
  const rehearsableScenes = allScenes.filter((s) => s.rehearsableLines > 0);
  const neverRehearsed = rehearsableScenes.filter((s) => s.rehearsalCount === 0).length;
  const hotCount = rehearsableScenes.filter((s) => s.rehearsalCount >= 5).length;

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 p-0.5 bg-background/50 rounded-lg w-fit">
        <button
          onClick={() => setMode('coverage')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            mode === 'coverage'
              ? 'bg-surface text-gold border border-gold/30'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Coverage
        </button>
        <button
          onClick={() => setMode('rehearsals')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            mode === 'rehearsals'
              ? 'bg-surface text-gold border border-gold/30'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Rehearsals
        </button>
      </div>

      {/* Grid by act */}
      <div className="space-y-3">
        {acts.map((act) => (
          <div key={act.id}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-gold font-medium">Act {act.actNumber}</span>
              {mode === 'coverage' && (
                <span className="text-xs text-muted font-mono">{act.completion.percentage}%</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {act.scenes.map((scene) => {
                const color = mode === 'coverage'
                  ? getCoverageColor(scene.completionPct)
                  : getRehearsalColor(scene.rehearsalCount);

                const tooltip = mode === 'coverage'
                  ? `Scene ${scene.sceneNumber}: ${scene.sceneHeading ?? 'Untitled'} — ${scene.recordedLines}/${scene.rehearsableLines} lines (${scene.completionPct}%)`
                  : `Scene ${scene.sceneNumber}: ${scene.sceneHeading ?? 'Untitled'} — ${scene.rehearsalCount} rehearsal${scene.rehearsalCount !== 1 ? 's' : ''}`;

                return (
                  <Link
                    key={scene.id}
                    href={`/panel/${scene.id}`}
                    className={`w-6 h-6 rounded-sm ${color} hover:ring-1 hover:ring-gold/50 transition-all`}
                    title={tooltip}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Rehearsal balance summary */}
      {mode === 'rehearsals' && (
        <p className="text-xs text-muted mt-3">
          {neverRehearsed > 0 && (
            <span className="text-red-400">{neverRehearsed} scene{neverRehearsed !== 1 ? 's' : ''} never rehearsed. </span>
          )}
          {hotCount > 0 && (
            <span>{hotCount} scene{hotCount !== 1 ? 's' : ''} with 5+ rehearsals.</span>
          )}
          {neverRehearsed === 0 && hotCount === 0 && (
            <span>No rehearsals recorded yet.</span>
          )}
        </p>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {mode === 'coverage' ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <div className="w-2.5 h-2.5 rounded-sm bg-green-600" />
              <span>Complete</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <div className="w-2.5 h-2.5 rounded-sm bg-gold" />
              <span>Partial</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <div className="w-2.5 h-2.5 rounded-sm bg-zinc-800" />
              <span>Empty</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <div className="w-2.5 h-2.5 rounded-sm bg-gold" />
              <span>3+ rehearsals</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <div className="w-2.5 h-2.5 rounded-sm bg-zinc-700" />
              <span>1-2 rehearsals</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <div className="w-2.5 h-2.5 rounded-sm bg-red-900/40" />
              <span>Never rehearsed</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

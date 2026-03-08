'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ChunkBreakdown from '@/components/stats/chunk-breakdown';
import CharacterRoster from '@/components/stats/character-roster';
import CoverageGrid from '@/components/stats/coverage-grid';

interface SceneDashboard {
  id: string;
  sceneNumber: number;
  sceneHeading: string | null;
  totalChunks: number;
  performableChunks: number;
  uniqueCharacters: string[];
  recorded: number;
  completionPct: number;
  rehearsalCount: number;
}

interface ActDashboard {
  id: string;
  actNumber: number;
  totalChunks: number;
  completion: { totalPerformable: number; recorded: number; percentage: number };
  scenes: SceneDashboard[];
}

interface DashboardData {
  script: {
    id: string;
    title: string;
    rank: number | null;
    year: number | null;
    slug: string;
    totalActs: number;
    totalScenes: number;
    totalChunks: number;
  };
  chunkBreakdown: {
    dialogue: number;
    action: number;
    scene_heading: number;
    transition: number;
    system: number;
    performable: number;
  };
  characters: { name: string; dialogueChunks: number }[];
  completion: { totalPerformable: number; recorded: number; percentage: number };
  acts: ActDashboard[];
  rehearsalBalance: {
    totalRehearsals: number;
    hotSpots: { sceneId: string; sceneNumber: number; actNumber: number; count: number }[];
    coldSpots: { sceneId: string; sceneNumber: number; actNumber: number; count: number }[];
  };
}

export default function ScriptDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/stats/${slug}`);
      if (res.status === 403) {
        router.replace('/stats/me');
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to load');
        setLoading(false);
        return;
      }
      setData(await res.json());
      setLoading(false);
    }
    load();
  }, [slug, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-red-400">{error || 'Not found'}</p>
      </div>
    );
  }

  const { script, chunkBreakdown, characters, completion, acts, rehearsalBalance } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Back link + Script Header */}
      <Link href="/stats/coverage" className="text-xs text-muted hover:text-foreground transition-colors">
        &larr; All Scripts
      </Link>

      <div className="mt-3 mb-8">
        <h1 className="text-2xl font-bold text-gold">
          {script.rank && <span className="text-muted mr-2">#{script.rank}</span>}
          {script.title}
          {script.year && <span className="text-muted text-lg ml-2">({script.year})</span>}
        </h1>
        <p className="text-sm text-muted mt-1">
          {script.totalActs} acts &middot; {script.totalScenes} scenes &middot; {script.totalChunks} chunks
        </p>
      </div>

      {/* Chunk Breakdown */}
      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Chunk Breakdown</h2>
        <ChunkBreakdown
          dialogue={chunkBreakdown.dialogue}
          action={chunkBreakdown.action}
          sceneHeading={chunkBreakdown.scene_heading}
          transition={chunkBreakdown.transition}
          system={chunkBreakdown.system}
          performable={chunkBreakdown.performable}
        />
      </section>

      {/* Overall Completion */}
      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Completion</h2>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">
            {completion.recorded} / {completion.totalPerformable} rehearsable chunks recorded
          </span>
          <span className="text-sm font-mono text-gold">{completion.percentage}%</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gold rounded-full transition-all"
            style={{ width: `${completion.percentage}%` }}
          />
        </div>

        {/* Per-act breakdown */}
        <div className="mt-4 space-y-2">
          {acts.map((act) => (
            <div key={act.id} className="flex items-center gap-3">
              <span className="text-xs text-muted w-12 flex-shrink-0">Act {act.actNumber}</span>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold/70 rounded-full transition-all"
                  style={{ width: `${act.completion.percentage}%` }}
                />
              </div>
              <span className="text-xs text-muted font-mono w-8 text-right">{act.completion.percentage}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Character Roster */}
      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">
          Characters ({characters.length})
        </h2>
        <CharacterRoster
          characters={characters}
          totalDialogue={chunkBreakdown.dialogue}
        />
      </section>

      {/* Coverage Grid + Rehearsal Balance */}
      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Scene Map</h2>
        <CoverageGrid acts={acts} />
      </section>

      {/* Rehearsal Balance Summary */}
      {rehearsalBalance.totalRehearsals > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Rehearsal Highlights</h2>

          {rehearsalBalance.hotSpots.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">Most rehearsed</p>
              <div className="space-y-1">
                {rehearsalBalance.hotSpots.map((s) => (
                  <div key={s.sceneId} className="flex items-center justify-between text-sm">
                    <span>Act {s.actNumber}, Scene {s.sceneNumber}</span>
                    <span className="text-xs text-gold font-mono">{s.count} rehearsal{s.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted">
            {rehearsalBalance.totalRehearsals} total rehearsal{rehearsalBalance.totalRehearsals !== 1 ? 's' : ''} &middot;{' '}
            {rehearsalBalance.coldSpots.length} scene{rehearsalBalance.coldSpots.length !== 1 ? 's' : ''} never rehearsed
          </p>
        </section>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import RoleCall from '@/components/stats/role-call';

interface Summary {
  totalRecordings: number;
  uniqueChunksRecorded: number;
  scriptsContributedTo: number;
  typeBreakdown: { dialogue: number; action: number; scene_heading: number; transition: number };
}

interface RecentSession {
  recordingId: string;
  character: string | null;
  sceneHeading: string | null;
  scriptTitle: string;
  createdAt: string;
}

export default function MyStatsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [characters, setCharacters] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/stats/me');
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters);
        setRecentSessions(data.recentSessions);
        setSummary(data.summary);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading your stats...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-1">Your Role Call</h1>
      <p className="text-sm text-muted mb-8">Your characters, progress, and recording history.</p>

      {summary && summary.totalRecordings > 0 && (() => {
        const totalRec = characters.reduce((s, c) => s + c.totalRecorded, 0);
        const totalChk = characters.reduce((s, c) => s + c.totalChunks, 0);
        const overallPct = totalChk > 0 ? Math.round((totalRec / totalChk) * 100) : 0;
        const tb = summary.typeBreakdown;
        const tbTotal = tb.dialogue + tb.action + tb.scene_heading + tb.transition;
        return (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gold">{summary.totalRecordings}</p>
                <p className="text-xs text-muted mt-1">Take{summary.totalRecordings !== 1 ? 's' : ''} Recorded</p>
              </div>
              <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gold">{characters.length}</p>
                <p className="text-xs text-muted mt-1">Role{characters.length !== 1 ? 's' : ''} Played</p>
              </div>
              <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gold">{overallPct}%</p>
                <p className="text-xs text-muted mt-1">Overall Progress</p>
              </div>
            </div>
            <button
              onClick={() => setBreakdownOpen(!breakdownOpen)}
              className="text-xs text-muted/50 hover:text-muted mb-8 transition-colors"
            >
              View breakdown by type {breakdownOpen ? '▴' : '▾'}
            </button>
            {breakdownOpen && tbTotal > 0 && (
              <div className="mb-8">
                <div className="h-3 rounded-full overflow-hidden flex">
                  {tb.dialogue > 0 && (
                    <div className="bg-gold h-full" style={{ width: `${(tb.dialogue / tbTotal) * 100}%` }} />
                  )}
                  {tb.action > 0 && (
                    <div className="bg-amber-700 h-full" style={{ width: `${(tb.action / tbTotal) * 100}%` }} />
                  )}
                  {tb.scene_heading > 0 && (
                    <div className="bg-purple-400 h-full" style={{ width: `${(tb.scene_heading / tbTotal) * 100}%` }} />
                  )}
                  {tb.transition > 0 && (
                    <div className="bg-cyan-400 h-full" style={{ width: `${(tb.transition / tbTotal) * 100}%` }} />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                  {tb.dialogue > 0 && <span className="text-gold">{tb.dialogue} dialogue</span>}
                  {tb.action > 0 && <span className="text-amber-700">{tb.action} action</span>}
                  {tb.scene_heading > 0 && <span className="text-purple-400">{tb.scene_heading} scene heading</span>}
                  {tb.transition > 0 && <span className="text-cyan-400">{tb.transition} transition</span>}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <RoleCall characters={characters} />

      {recentSessions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Recent Recordings</h2>
          <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
            {recentSessions.map((session) => (
              <div key={session.recordingId} className="px-4 py-3 flex items-center justify-between">
                <div>
                  {session.character && (
                    <span className="text-gold text-sm font-medium mr-2">{session.character}</span>
                  )}
                  <span className="text-sm text-muted">{session.sceneHeading || 'Unknown scene'}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">{session.scriptTitle}</p>
                  <p className="text-xs text-muted/60">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

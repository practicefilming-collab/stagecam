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
  const [characters, setCharacters] = useState([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

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

      {summary && summary.totalRecordings > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gold">{summary.totalRecordings}</p>
            <p className="text-xs text-muted mt-1">Recordings</p>
          </div>
          <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gold">{summary.uniqueChunksRecorded}</p>
            <p className="text-xs text-muted mt-1">Unique Chunks</p>
          </div>
          <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gold">{summary.scriptsContributedTo}</p>
            <p className="text-xs text-muted mt-1">Scripts</p>
          </div>
          <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
            <div className="flex justify-center gap-2 text-xs">
              {summary.typeBreakdown.dialogue > 0 && <span className="text-gold">{summary.typeBreakdown.dialogue} dlg</span>}
              {summary.typeBreakdown.action > 0 && <span className="text-blue-400">{summary.typeBreakdown.action} act</span>}
              {summary.typeBreakdown.scene_heading > 0 && <span className="text-purple-400">{summary.typeBreakdown.scene_heading} hdr</span>}
              {summary.typeBreakdown.transition > 0 && <span className="text-cyan-400">{summary.typeBreakdown.transition} trn</span>}
            </div>
            <p className="text-xs text-muted mt-1">By Type</p>
          </div>
        </div>
      )}

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

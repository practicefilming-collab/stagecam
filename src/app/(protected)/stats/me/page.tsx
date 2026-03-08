'use client';

import { useEffect, useState } from 'react';
import RoleCall from '@/components/stats/role-call';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/stats/me');
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters);
        setRecentSessions(data.recentSessions);
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
      <h1 className="text-2xl font-bold text-gold mb-8">Your Role Call</h1>

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

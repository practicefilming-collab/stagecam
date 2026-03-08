'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Script } from '@/lib/types';

interface ScriptStats extends Script {
  recorded_chunks: number;
  completion: number;
}

export default function StatsPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<ScriptStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/stats');
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (res.ok) {
        setScripts(await res.json());
      }
      setLoading(false);
    }
    load();
  }, []);

  // Non-admins get redirected to personal stats
  useEffect(() => {
    if (forbidden) {
      router.replace('/stats/me');
    }
  }, [forbidden, router]);

  if (loading || forbidden) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading stats...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gold">Coverage Stats</h1>
        <Link href="/stats/me" className="text-xs text-muted hover:text-foreground transition-colors">
          Your Role Call &rarr;
        </Link>
      </div>

      <div className="space-y-3">
        {scripts.map((script) => (
          <Link
            key={script.id}
            href={`/stats/${script.slug}`}
            className="block bg-surface border border-border rounded-xl p-5 hover:border-gold/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs text-muted mr-2">#{script.rank}</span>
                <span className="font-medium">{script.title}</span>
                <span className="text-muted text-sm ml-2">({script.year})</span>
              </div>
              <span className="text-sm font-mono text-gold">
                {script.completion}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gold transition-all rounded-full"
                style={{ width: `${script.completion}%` }}
              />
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-muted">
              <span>{script.recorded_chunks} recorded</span>
              <span>{script.total_acts} acts, {script.total_scenes} scenes</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

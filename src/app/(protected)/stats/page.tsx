'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Script } from '@/lib/types';

interface ScriptStats extends Script {
  recorded_chunks: number;
  completion: number;
}

export default function StatsPage() {
  const [scripts, setScripts] = useState<ScriptStats[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('scripts')
        .select('*')
        .order('rank');

      // For each script, get recording count
      const stats: ScriptStats[] = [];
      for (const script of data ?? []) {
        // Get chunks with recordings
        const { data: recordings } = await supabase
          .from('recordings')
          .select('chunk_id')
          .eq('chunks.scene_id', script.id);

        const recordedChunks = new Set((recordings ?? []).map((r) => r.chunk_id)).size;

        stats.push({
          ...script,
          recorded_chunks: recordedChunks,
          completion: script.total_chunks > 0
            ? Math.round((recordedChunks / script.total_chunks) * 100)
            : 0,
        });
      }

      setScripts(stats);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading stats...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-8">Coverage Stats</h1>

      <div className="space-y-3">
        {scripts.map((script) => (
          <div
            key={script.id}
            className="bg-surface border border-border rounded-xl p-5"
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
              <span>{script.recorded_chunks} / {script.total_chunks} chunks</span>
              <span>{script.total_acts} acts, {script.total_scenes} scenes</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

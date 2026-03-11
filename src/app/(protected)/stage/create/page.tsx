'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getScriptTotalLines } from '@/lib/line-helpers';
import type { Script, SelectionMode } from '@/lib/types';

export default function CreateStagePage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [mode, setMode] = useState<SelectionMode>('auto');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function loadScripts() {
      const { data } = await supabase
        .from('scripts')
        .select('*')
        .order('rank', { ascending: true });
      setScripts(data ?? []);
      setLoading(false);
    }
    void loadScripts();
  }, [supabase]);

  const createRoom = async () => {
    if (!selectedScript) return;
    setCreating(true);

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_id: selectedScript,
          selection_mode: mode,
        }),
      });

      if (!res.ok) {
        setCreating(false);
        return;
      }

      const room = await res.json();
      router.push(`/stage/${room.room_code}`);
    } catch {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading scripts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 spotlight min-h-[calc(100vh-3.5rem)]">
      <h1 className="text-2xl font-bold text-gold mb-8">Create Stage</h1>

      {/* Script Selection */}
      <div className="mb-8">
        <label className="block text-sm text-muted mb-3">Select a Script</label>
        <div className="grid gap-2 max-h-96 overflow-y-auto pr-2">
          {scripts.map((script) => (
            <button
              key={script.id}
              onClick={() => setSelectedScript(script.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                selectedScript === script.id
                  ? 'border-gold bg-gold/5'
                  : 'border-border bg-surface hover:border-border hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted mr-2">#{script.rank}</span>
                  <span className="font-medium">{script.title}</span>
                  <span className="text-muted text-sm ml-2">({script.year})</span>
                </div>
                <span className="text-xs text-muted">
                  {getScriptTotalLines(script)} lines
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Mode Selection */}
      <div className="mb-8">
        <label className="block text-sm text-muted mb-3">Selection Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('auto')}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'auto'
                ? 'border-gold bg-gold/5'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="font-medium mb-1">Auto</div>
            <p className="text-xs text-muted">
              System picks the best scene based on participant count and coverage gaps.
            </p>
          </button>
          <button
            onClick={() => setMode('pick')}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'pick'
                ? 'border-gold bg-gold/5'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="font-medium mb-1">Pick</div>
            <p className="text-xs text-muted">
              Choose a specific act or scene to rehearse.
            </p>
          </button>
        </div>
      </div>

      {/* Create Button */}
      <button
        onClick={createRoom}
        disabled={!selectedScript || creating}
        className="w-full py-3 bg-gold text-black rounded-xl font-semibold text-lg hover:bg-gold-dim transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create Stage'}
      </button>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PanelScene {
  scene: {
    id: string;
    scene_heading: string;
    total_chunks: number;
    acts: {
      act_number: number;
      scripts: { title: string; year: number };
    };
  };
  participantCount: number;
  coverage: number;
  isComplete: boolean;
}

export default function PanelPage() {
  const [panels, setPanels] = useState<PanelScene[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/panels');
      const data = await res.json();
      setPanels(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading panels...</p>
      </div>
    );
  }

  if (panels.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gold mb-4">Join Panel</h1>
        <p className="text-muted mb-8">
          Complete at least one chunk recording to unlock the panel view.
          Record a scene to see your performance alongside others.
        </p>
        <Link
          href="/stage/create"
          className="px-6 py-3 bg-gold text-black rounded-xl font-semibold inline-block hover:bg-gold-dim transition-colors"
        >
          Start Rehearsing
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-8">Join Panel</h1>

      <div className="grid gap-4">
        {panels.map((panel) => (
          <Link
            key={panel.scene.id}
            href={`/panel/${panel.scene.id}`}
            className="bg-surface border border-border rounded-xl p-6 hover:border-gold/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold group-hover:text-gold transition-colors">
                {panel.scene.acts.scripts.title}
              </h2>
              <span className="text-xs text-muted">
                Act {panel.scene.acts.act_number}
              </span>
            </div>
            <p className="text-sm text-muted mb-3">{panel.scene.scene_heading}</p>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span>{panel.participantCount} performer{panel.participantCount !== 1 ? 's' : ''}</span>
              <span>{Math.round(panel.coverage * 100)}% coverage</span>
              {panel.isComplete && (
                <span className="text-green-400">Complete</span>
              )}
            </div>
            {/* Coverage bar */}
            <div className="mt-3 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${Math.round(panel.coverage * 100)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

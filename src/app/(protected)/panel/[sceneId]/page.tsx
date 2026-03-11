'use client';

import { useParams } from 'next/navigation';
import ScenePlayer from '@/components/player/scene-player';
import Link from 'next/link';

export default function PanelViewerPage() {
  const params = useParams();
  const sceneId = params.sceneId as string;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 min-h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gold">Panel Viewer</h1>
        <Link
          href="/history"
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Back to Main Stage
        </Link>
      </div>

      <ScenePlayer sceneId={sceneId} />
    </div>
  );
}

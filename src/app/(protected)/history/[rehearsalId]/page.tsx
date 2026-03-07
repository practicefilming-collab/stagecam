'use client';

import { useParams } from 'next/navigation';

export default function RehearsalPlaybackPage() {
  const params = useParams();
  const rehearsalId = params.rehearsalId as string;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-8">Rehearsal Playback</h1>
      <p className="text-muted">
        Rehearsal ID: {rehearsalId}
      </p>
      <p className="text-muted mt-4">
        Full playback and download functionality coming soon.
      </p>
    </div>
  );
}

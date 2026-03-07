'use client';

import { useParams, useRouter } from 'next/navigation';

export default function CompletePage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto px-4 py-16 spotlight min-h-[calc(100vh-3.5rem)] text-center">
      <div className="text-5xl mb-6">🎬</div>
      <h1 className="text-2xl font-bold text-gold mb-3">That's a Wrap!</h1>
      <p className="text-muted mb-8">
        All your chunks have been recorded and uploaded successfully.
      </p>

      <div className="space-y-3">
        <button
          onClick={() => router.push(`/stage/${roomCode}`)}
          className="w-full py-3 bg-surface border border-border rounded-xl font-medium hover:border-gold/30 transition-colors"
        >
          Back to Stage
        </button>
        <button
          onClick={() => router.push('/menu')}
          className="w-full py-3 bg-gold text-black rounded-xl font-semibold hover:bg-gold-dim transition-colors"
        >
          Main Menu
        </button>
      </div>
    </div>
  );
}

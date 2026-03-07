'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function MenuPage() {
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoining(true);
    setError('');

    const code = joinCode.trim().toUpperCase();
    const { data: room } = await supabase
      .from('rooms')
      .select('room_code, status')
      .eq('room_code', code)
      .single();

    if (!room) {
      setError('Room not found');
      setJoining(false);
      return;
    }

    if (room.status === 'closed') {
      setError('This room has been closed');
      setJoining(false);
      return;
    }

    router.push(`/stage/${code}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 spotlight min-h-[calc(100vh-3.5rem)]">
      <h1 className="text-3xl font-bold text-gold text-gold-glow mb-12 text-center">
        Main Stage
      </h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create Stage */}
        <Link
          href="/stage/create"
          className="group bg-surface border border-border rounded-2xl p-8 hover:border-gold/30 transition-all"
        >
          <div className="text-3xl mb-4">🎬</div>
          <h2 className="text-xl font-semibold mb-2 group-hover:text-gold transition-colors">
            Create Stage
          </h2>
          <p className="text-sm text-muted">
            Pick a script and start a rehearsal room. Share the code with others or go solo.
          </p>
        </Link>

        {/* Join Stage */}
        <div className="bg-surface border border-border rounded-2xl p-8">
          <div className="text-3xl mb-4">🎭</div>
          <h2 className="text-xl font-semibold mb-4">Join Stage</h2>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-center uppercase placeholder:text-muted/40 focus:outline-none focus:border-gold/50"
            />
            <button
              type="submit"
              disabled={joining || joinCode.length < 6}
              className="px-4 py-2 bg-gold text-black rounded-lg font-medium text-sm hover:bg-gold-dim transition-colors disabled:opacity-50"
            >
              {joining ? '...' : 'Join'}
            </button>
          </form>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>

        {/* Panel */}
        <Link
          href="/panel"
          className="group bg-surface border border-border rounded-2xl p-8 hover:border-gold/30 transition-all"
        >
          <div className="text-3xl mb-4">🎞️</div>
          <h2 className="text-xl font-semibold mb-2 group-hover:text-gold transition-colors">
            Join Panel
          </h2>
          <p className="text-sm text-muted">
            Watch composite scenes with other performers. See how your recordings fit together.
          </p>
        </Link>

        {/* History */}
        <Link
          href="/history"
          className="group bg-surface border border-border rounded-2xl p-8 hover:border-gold/30 transition-all"
        >
          <div className="text-3xl mb-4">📚</div>
          <h2 className="text-xl font-semibold mb-2 group-hover:text-gold transition-colors">
            History
          </h2>
          <p className="text-sm text-muted">
            Browse your past rehearsals, view cast lists, and download recordings.
          </p>
        </Link>
      </div>
    </div>
  );
}

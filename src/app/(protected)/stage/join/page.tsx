'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function JoinStagePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;

    setJoining(true);
    setError('');

    const roomCode = code.toUpperCase();
    const { data: room } = await supabase
      .from('rooms')
      .select('room_code, status')
      .eq('room_code', roomCode)
      .single();

    if (!room) {
      setError('Room not found. Check the code and try again.');
      setJoining(false);
      return;
    }

    if (room.status === 'closed') {
      setError('This room has been closed.');
      setJoining(false);
      return;
    }

    router.push(`/stage/${roomCode}`);
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-16 spotlight min-h-[calc(100vh-3.5rem)]">
      <h1 className="text-2xl font-bold text-gold mb-8 text-center">Join Stage</h1>

      <form onSubmit={handleJoin} className="space-y-4">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ROOM CODE"
          className="w-full bg-surface border border-border rounded-xl px-4 py-4 text-2xl font-mono tracking-[0.4em] text-center uppercase placeholder:text-muted/30 focus:outline-none focus:border-gold/50"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={joining || code.length < 6}
          className="w-full py-3 bg-gold text-black rounded-xl font-semibold text-lg hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          {joining ? 'Joining...' : 'Join'}
        </button>
      </form>
    </div>
  );
}

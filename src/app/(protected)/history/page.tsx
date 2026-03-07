'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface HistoryItem {
  id: string;
  room_code: string;
  status: string;
  created_at: string;
  scripts: { title: string; year: number };
}

export default function HistoryPage() {
  const [rooms, setRooms] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      setRooms(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-8">Rehearsal History</h1>

      {rooms.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted mb-4">No rehearsals yet.</p>
          <Link
            href="/stage/create"
            className="px-6 py-3 bg-gold text-black rounded-xl font-semibold inline-block hover:bg-gold-dim transition-colors"
          >
            Start Your First Rehearsal
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/panel/${room.id}`}
              className="bg-surface border border-border rounded-xl p-5 hover:border-gold/30 transition-all group"
            >
              <h3 className="font-semibold mb-1 group-hover:text-gold transition-colors">
                {room.scripts.title}
              </h3>
              <p className="text-xs text-muted mb-3">
                {room.scripts.year} - {new Date(room.created_at).toLocaleDateString()}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted">{room.room_code}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  room.status === 'closed' ? 'bg-border text-muted' :
                  room.status === 'active' ? 'bg-green-500/10 text-green-400' :
                  'bg-gold/10 text-gold'
                }`}>
                  {room.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

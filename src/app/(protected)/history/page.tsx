'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface HistoryItem {
  id: string;
  room_code: string;
  status: string;
  created_at: string;
  selected_scene_id: string | null;
  scripts: { title: string; year: number };
  scenes: { scene_heading: string | null } | null;
  recording_count: number;
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
          {rooms.map((room) => {
            const hasScene = !!room.selected_scene_id;
            const inner = (
              <>
                <h3 className={`font-semibold mb-1 ${hasScene ? 'group-hover:text-gold' : ''} transition-colors`}>
                  {room.scripts?.title ?? 'Untitled'}
                </h3>
                {room.scenes?.scene_heading && (
                  <p className="text-xs text-gold/60 mb-1 truncate">{room.scenes.scene_heading}</p>
                )}
                <p className="text-xs text-muted mb-3">
                  {room.scripts?.year ? `${room.scripts.year} \u00b7 ` : ''}{new Date(room.created_at).toLocaleDateString()}
                  {room.recording_count > 0 && (
                    <span className="ml-2 text-gold/80">{room.recording_count} rec{room.recording_count !== 1 ? 's' : ''}</span>
                  )}
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
              </>
            );

            return hasScene ? (
              <Link
                key={room.id}
                href={`/panel/${room.selected_scene_id}`}
                className="bg-surface border border-border rounded-xl p-5 hover:border-gold/30 transition-all group"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={room.id}
                className="bg-surface border border-border rounded-xl p-5 opacity-60"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

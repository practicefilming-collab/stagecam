'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ScriptRequestItem {
  id: string;
  title: string;
  fulfilled_script_id: string | null;
  created_at: string;
  profiles: { display_name: string };
  script_request_votes: { count: number }[];
  userVoted?: boolean;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<ScriptRequestItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadRequests = async () => {
    const res = await fetch('/api/requests');
    const data = await res.json();

    // Check which ones user has voted on
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: votes } = await supabase
        .from('script_request_votes')
        .select('request_id')
        .eq('user_id', user.id);
      const votedIds = new Set((votes ?? []).map((v) => v.request_id));
      data.forEach((r: ScriptRequestItem) => {
        r.userVoted = votedIds.has(r.id);
      });
    }

    setRequests(data);
    setLoading(false);
  };

  useEffect(() => { loadRequests(); }, []);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);

    await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });

    setNewTitle('');
    setSubmitting(false);
    loadRequests();
  };

  const toggleVote = async (requestId: string, currentlyVoted: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (currentlyVoted) {
      await supabase
        .from('script_request_votes')
        .delete()
        .eq('request_id', requestId)
        .eq('user_id', user.id);
    } else {
      await supabase.from('script_request_votes').insert({
        request_id: requestId,
        user_id: user.id,
      });
    }

    loadRequests();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-8">Script Requests</h1>

      {/* Submit form */}
      <form onSubmit={submitRequest} className="mb-8 flex gap-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Request a movie script..."
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-sm placeholder:text-muted/40 focus:outline-none focus:border-gold/50"
        />
        <button
          type="submit"
          disabled={submitting || !newTitle.trim()}
          className="px-6 py-3 bg-gold text-black rounded-lg font-medium text-sm hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          {submitting ? '...' : 'Request'}
        </button>
      </form>

      {/* Requests list */}
      <div className="space-y-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className={`bg-surface border rounded-xl p-5 flex items-center justify-between ${
              req.fulfilled_script_id ? 'border-green-500/30' : 'border-border'
            }`}
          >
            <div>
              <h3 className="font-medium">
                {req.title}
                {req.fulfilled_script_id && (
                  <span className="ml-2 text-xs text-green-400">Added</span>
                )}
              </h3>
              <p className="text-xs text-muted mt-1">
                Requested by {req.profiles.display_name} - {new Date(req.created_at).toLocaleDateString()}
              </p>
            </div>

            <button
              onClick={() => toggleVote(req.id, req.userVoted ?? false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                req.userVoted
                  ? 'border-gold text-gold bg-gold/10'
                  : 'border-border text-muted hover:text-foreground hover:border-border'
              }`}
            >
              <span className="font-mono">{req.script_request_votes?.[0]?.count ?? 0}</span>
              <span>{req.userVoted ? 'Voted' : 'Vote'}</span>
            </button>
          </div>
        ))}

        {requests.length === 0 && (
          <p className="text-muted text-center py-8">
            No script requests yet. Be the first to request one!
          </p>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserStat {
  id: string;
  displayName: string;
  authProvider: string;
  username: string | null;
  joinedAt: string;
  scriptsParticipated: number;
  totalRecordings: number;
  storageBytes: number;
}

function formatStorage(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function providerBadge(provider: string) {
  const colors: Record<string, string> = {
    google: 'bg-blue-500/15 text-blue-400',
    instagram: 'bg-pink-500/15 text-pink-400',
    tiktok: 'bg-cyan-500/15 text-cyan-400',
  };
  const cls = colors[provider] ?? 'bg-muted/15 text-muted';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${cls}`}>
      {provider}
    </span>
  );
}

export default function UserStatsPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/stats/users');
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (forbidden) {
      router.replace('/stats/me');
    }
  }, [forbidden, router]);

  if (loading || forbidden) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link href="/stats" className="text-xs text-muted hover:text-foreground transition-colors">
        &larr; Admin Hub
      </Link>

      <h1 className="text-2xl font-bold text-gold mt-3 mb-8">Users</h1>

      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="bg-surface border border-border rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="font-medium">{u.displayName || 'Unnamed'}</span>
                {providerBadge(u.authProvider)}
              </div>
              <span className="text-xs text-muted">{formatDate(u.joinedAt)}</span>
            </div>

            {u.username && (
              <p className="text-sm text-muted mb-2">{u.username}</p>
            )}

            <div className="flex items-center gap-6 text-xs text-muted">
              <span>{u.scriptsParticipated} script{u.scriptsParticipated !== 1 ? 's' : ''}</span>
              <span>{u.totalRecordings} recording{u.totalRecordings !== 1 ? 's' : ''}</span>
              <span>{formatStorage(u.storageBytes)}</span>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p className="text-muted text-center py-8">No users yet.</p>
        )}
      </div>
    </div>
  );
}

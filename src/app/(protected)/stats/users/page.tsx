'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Totals {
  totalUsers: number;
  totalScripts: number;
  scriptsWithRecordings: number;
  totalRecordings: number;
  totalStorage: number;
}

interface UserStat {
  id: string;
  displayName: string;
  authProvider: string;
  authAccountLabel: string | null;
  isAdmin: boolean;
  publicIdentityPlatform: string;
  publicIdentityLabel: string;
  username: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
  scriptsParticipated: number;
  totalRecordings: number;
  storageBytes: number;
}

function formatStorage(bytes: number): string {
  if (bytes === 0) return '-';
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
  const [totals, setTotals] = useState<Totals | null>(null);
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
        setTotals(data.totals);
      }
      setLoading(false);
    }
    void load();
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
        &larr; Admin Stats
      </Link>

      <h1 className="text-2xl font-bold text-gold mt-3 mb-8">Users</h1>

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Users', value: totals.totalUsers },
            { label: 'Scripts Recorded', value: `${totals.scriptsWithRecordings} of ${totals.totalScripts}` },
            { label: 'Recordings', value: totals.totalRecordings },
            { label: 'Storage', value: formatStorage(totals.totalStorage) },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-surface border border-gold/20 rounded-xl p-4 text-center"
            >
              <p className="text-2xl font-bold text-gold">{item.value}</p>
              <p className="text-xs text-muted mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className={`bg-surface border rounded-xl p-5 ${
              u.isAdmin ? 'border-gold shadow-[0_0_0_1px_rgba(212,175,55,0.25)]' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2 gap-4">
              <div className="flex items-center gap-3">
                <span className="font-medium">{u.displayName || 'Unnamed'}</span>
                {providerBadge(u.publicIdentityPlatform)}
                {u.isAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gold/15 text-gold border border-gold/30">
                    Admin
                  </span>
                )}
              </div>
              <span className="text-sm text-muted text-right">
                {u.authAccountLabel ?? 'google'}
              </span>
            </div>

            <div className="flex items-center gap-6 text-xs text-muted mb-3">
              <span>Auth: {u.authProvider}</span>
              <span>{u.scriptsParticipated} script{u.scriptsParticipated !== 1 ? 's' : ''}</span>
              <span>{u.totalRecordings} recording{u.totalRecordings !== 1 ? 's' : ''}</span>
              <span>{formatStorage(u.storageBytes)}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-muted border-t border-border pt-3">
              <span>Last Login: {u.lastLoginAt ? formatDate(u.lastLoginAt) : '-'}</span>
              <span>Created: {formatDate(u.joinedAt)}</span>
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

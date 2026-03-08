'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const res = await fetch('/api/stats');
      if (res.status === 403) {
        setForbidden(true);
      }
      setLoading(false);
    }
    checkAdmin();
  }, []);

  useEffect(() => {
    if (forbidden) {
      router.replace('/stats/me');
    }
  }, [forbidden, router]);

  if (loading || forbidden) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 min-h-[calc(100vh-3.5rem)]">
      <h1 className="text-3xl font-bold text-gold mb-12 text-center">
        Admin Stats
      </h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Link
          href="/stats/coverage"
          className="group bg-surface border border-border rounded-2xl p-8 hover:border-gold/30 transition-all"
        >
          <div className="text-3xl mb-4">📊</div>
          <h2 className="text-xl font-semibold mb-2 group-hover:text-gold transition-colors">
            Coverage Stats
          </h2>
          <p className="text-sm text-muted">
            Track recording progress across all scripts and scenes.
          </p>
        </Link>

        <Link
          href="/stats/users"
          className="group bg-surface border border-border rounded-2xl p-8 hover:border-gold/30 transition-all"
        >
          <div className="text-3xl mb-4">👥</div>
          <h2 className="text-xl font-semibold mb-2 group-hover:text-gold transition-colors">
            User Stats
          </h2>
          <p className="text-sm text-muted">
            View all users, their login type, activity, and storage usage.
          </p>
        </Link>
      </div>
    </div>
  );
}

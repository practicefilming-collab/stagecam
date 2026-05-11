'use client';

import { useMemo, useState } from 'react';
import type { AccessRosterUser } from '@/lib/access';

export function AccessDashboard({
  initialUsers,
  selfUserId,
}: {
  initialUsers: AccessRosterUser[];
  selfUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const counts = useMemo(() => ({
    admins: users.filter((user) => user.is_admin).length,
    pro: users.filter((user) => user.auditions_enabled || user.is_admin).length,
    regular: users.filter((user) => !user.is_admin && !user.auditions_enabled).length,
  }), [users]);

  async function updateUserAccess(user: AccessRosterUser, changes: Partial<Pick<AccessRosterUser, 'is_admin' | 'auditions_enabled'>>) {
    const savingId = `${user.id}:${Object.keys(changes).join(',')}`;
    setSavingKey(savingId);
    setError('');
    setSuccess('');

    const response = await fetch(`/api/access/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || 'Could not update access');
      setSavingKey(null);
      return;
    }

    setUsers((current) => current.map((item) => (item.id === user.id ? payload : item)));
    setSuccess(`Updated access for ${payload.display_name}.`);
    setSavingKey(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <section className="rounded-3xl border border-border bg-surface p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Global Control</p>
            <h1 className="mt-2 text-3xl font-bold text-gold">Access</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Manage global admin access and StageCam Pro invites from one place. Admin is system-wide.
              StageCam Pro is the lower-tier feature access used by Auditions.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm md:min-w-[28rem]">
            <div className="rounded-2xl border border-border bg-background/40 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">Admins</div>
              <div className="mt-1 text-xl font-semibold">{counts.admins}</div>
            </div>
            <div className="rounded-2xl border border-border bg-background/40 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">StageCam Pro</div>
              <div className="mt-1 text-xl font-semibold">{counts.pro}</div>
            </div>
            <div className="rounded-2xl border border-border bg-background/40 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">Regular</div>
              <div className="mt-1 text-xl font-semibold">{counts.regular}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-foreground">User Access</h2>
          <p className="mt-1 text-sm text-muted">
            Admins have full system access. StageCam Pro grants feature access without admin rights.
          </p>
        </div>

        {success && <p className="mb-4 text-sm text-green-400">{success}</p>}
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="space-y-3">
          {users.map((user) => {
            const adminSaving = savingKey === `${user.id}:is_admin`;
            const proSaving = savingKey === `${user.id}:auditions_enabled`;
            const blockAdminRemoval = user.id === selfUserId && user.is_admin;

            return (
              <div key={user.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-background/40 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{user.display_name}</h3>
                    {user.is_admin && <span className="rounded-full border border-gold/30 px-2 py-0.5 text-[11px] text-gold">Admin</span>}
                    {(user.auditions_enabled || user.is_admin) && (
                      <span className="rounded-full border border-green-500/30 px-2 py-0.5 text-[11px] text-green-300">StageCam Pro</span>
                    )}
                    {!user.is_admin && !user.auditions_enabled && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">Regular user</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {user.auth_provider}
                    {user.auth_account_label ? ` | ${user.auth_account_label}` : ''}
                    {user.platform_username ? ` | ${user.platform_username}` : ''}
                    {` | joined ${new Date(user.created_at).toLocaleDateString()}`}
                    {user.last_login_at ? ` | last login ${new Date(user.last_login_at).toLocaleDateString()}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted">{user.public_identity_label}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => updateUserAccess(user, { auditions_enabled: !user.auditions_enabled })}
                    disabled={proSaving}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      user.auditions_enabled
                        ? 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                        : 'border border-green-500/30 text-green-300 hover:bg-green-500/10'
                    }`}
                  >
                    {proSaving ? 'Saving...' : user.auditions_enabled ? 'Remove StageCam Pro' : 'Grant StageCam Pro'}
                  </button>

                  <button
                    onClick={() => updateUserAccess(user, { is_admin: !user.is_admin })}
                    disabled={adminSaving || blockAdminRemoval}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      user.is_admin
                        ? 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                        : 'border border-gold/30 text-gold hover:bg-gold/10'
                    }`}
                    title={blockAdminRemoval ? 'You cannot remove your own admin role.' : undefined}
                  >
                    {adminSaving ? 'Saving...' : user.is_admin ? 'Remove Admin' : 'Grant Admin'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuditionScriptListItem } from '@/lib/auditions/data';

interface UploadUser {
  id: string;
  display_name: string;
  auditions_enabled?: boolean;
  is_admin?: boolean;
}

export function AuditionsDashboard({
  initialScripts,
  canManage,
  selfUserId,
  uploadUsers,
}: {
  initialScripts: AuditionScriptListItem[];
  canManage: boolean;
  selfUserId: string;
  uploadUsers: UploadUser[];
}) {
  const [scripts, setScripts] = useState(initialScripts);
  const [title, setTitle] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(
    canManage ? uploadUsers[0]?.id ?? '' : selfUserId,
  );
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const assignableUsers = useMemo(() => {
    if (!canManage) {
      return uploadUsers;
    }

    return uploadUsers
      .filter((user) => user.is_admin || user.auditions_enabled)
      .map((user) => ({
        id: user.id,
        display_name: user.display_name,
      }));
  }, [canManage, uploadUsers]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const script of scripts) {
      counts.set(script.status, (counts.get(script.status) ?? 0) + 1);
    }
    return counts;
  }, [scripts]);
  const queueCount = (statusCounts.get('uploaded') ?? 0) + (statusCounts.get('processing') ?? 0);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.set('title', title);
    formData.set('source_label', sourceLabel);
    if (canManage) {
      formData.set('assigned_rehearser_user_id', assignedUserId);
    }
    formData.set('file', file);

    const res = await fetch('/api/auditions', {
      method: 'POST',
      body: formData,
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Upload failed');
      setSubmitting(false);
      return;
    }

    const assignedRehearser = assignableUsers.find((user) => user.id === (canManage ? assignedUserId : selfUserId)) ?? null;
    setScripts((prev) => [{
      ...payload,
      assignedRehearser,
    }, ...prev]);
    setTitle('');
    setSourceLabel('');
    setFile(null);
    setSuccess(`Uploaded "${payload.title}" successfully.`);
    setSubmitting(false);
    router.refresh();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <section className="rounded-3xl border border-border bg-surface p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Stagecam Pro</p>
            <h1 className="mt-2 text-3xl font-bold text-gold">Auditions</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Private assigned-script rehearsal for confidential audition material. The work now moves through a readiness queue before scenes become room-ready and take-ready.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm md:min-w-96">
            <div className="rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-gold/80">Approval Queue</div>
              <div className="mt-1 text-xl font-semibold">{queueCount}</div>
              <div className="mt-1 text-xs text-muted">Uploaded or in prep</div>
            </div>
            {['uploaded', 'processing', 'ready', 'archived'].map((status) => (
              <div key={status} className="rounded-2xl border border-border bg-background/40 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-muted">{status}</div>
                <div className="mt-1 text-xl font-semibold">{statusCounts.get(status) ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-border bg-surface p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-foreground">Upload Private Script</h2>
            <p className="mt-1 text-sm text-muted">
              Accepted formats: PDF, DOCX, or TXT. {canManage ? 'Admins can assign any allowlisted rehearser.' : 'Your uploads are assigned to you automatically.'}
            </p>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Audition title"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
              required
            />
            <input
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              placeholder="Source label or job ref"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
              required
            />
            {canManage && (
              <>
                <select
                  value={assignedUserId}
                  onChange={(event) => setAssignedUserId(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  required
                >
                  <option value="">Assign rehearser</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.display_name}</option>
                  ))}
                </select>
                {assignableUsers.length === 0 && (
                  <p className="text-xs text-muted">
                    No assignable rehearsers yet. Grant StageCam Pro access from the global `Access` page, then select them here.
                  </p>
                )}
              </>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
              required
            />
            {success && <p className="text-sm text-green-400">{success}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !file || (canManage && !assignedUserId)}
              className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-gold-dim disabled:opacity-50"
            >
              {submitting ? 'Uploading...' : 'Upload Script'}
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Private Library</h2>
              <p className="mt-1 text-sm text-muted">
                {canManage ? 'Admin view across audition scripts.' : 'Only scripts assigned to you are shown here.'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {scripts.map((script) => (
              <Link
                key={script.id}
                href={`/pro/auditions/${script.id}`}
                className="block rounded-2xl border border-border bg-background/50 p-4 transition-colors hover:border-gold/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-foreground">{script.title}</h3>
                    <p className="mt-1 text-sm text-muted">{script.source_label}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-xs uppercase tracking-wide text-gold/80">{script.status}</span>
                      {script.assignedRehearser && (
                        <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted">
                          Assigned: {script.assignedRehearser.display_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted">{new Date(script.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
            {scripts.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                No audition scripts yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

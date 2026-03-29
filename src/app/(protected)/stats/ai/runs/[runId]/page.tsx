'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

interface RunProfile {
  id: string;
  displayName: string;
  voicePersonaId: string | null;
  voicePersonaLabel: string | null;
}

interface RunDetail {
  id: string;
  scriptId: string;
  scriptTitle: string;
  scriptYear: number | null;
  status: string;
  executionMode: string;
  providerConfig: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  totalLines: number;
  persistedLines: number;
  failedLines: number;
  errorMessage: string | null;
  queuedJobs: number;
  processingJobs: number;
  succeededJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  isIdleWithQueuedWork: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profiles: RunProfile[];
}

interface SceneJob {
  id: string;
  sceneId: string;
  aiProfileId: string;
  aiProfileName: string;
  status: string;
  progressPct: number;
  regenerateExisting: boolean;
  totalLines: number;
  persistedLines: number;
  failedLines: number;
  attemptCount: number;
  errorMessage: string | null;
  updatedAt: string;
  isStalled: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  sceneNumber: number | null;
  sceneHeading: string | null;
}

interface RunEntry {
  id: string;
  chunkId: string;
  sceneId: string;
  aiProfileId: string;
  aiProfileName: string;
  status: string;
  character: string | null;
  chunkInScene: number | null;
  sceneNumber: number | null;
  sceneHeading: string | null;
  sourceLine: string;
  errorMessage: string | null;
}

interface RunResponse {
  run: RunDetail;
  sceneJobs: SceneJob[];
  failedEntries: RunEntry[];
  skippedEntries: RunEntry[];
}

type ActionState =
  | { kind: 'success' | 'error'; message: string }
  | null;

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status: string): string {
  switch (status) {
    case 'active':
    case 'succeeded':
      return 'bg-green-500/15 text-green-400';
    case 'processing':
      return 'bg-blue-500/15 text-blue-400';
    case 'failed':
    case 'archived':
      return 'bg-red-500/15 text-red-400';
    case 'queued':
      return 'bg-amber-500/15 text-amber-300';
    default:
      return 'bg-muted/15 text-muted';
  }
}

export default function AiRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = params.runId as string;
  const statusFilter = searchParams.get('status') ?? 'all';

  const [data, setData] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState<'kickoff' | 'retry' | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      const res = await fetch(`/api/admin/ai/runs/${runId}`);

      if (cancelled) return;

      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to load run' }));
        if (cancelled) return;
        setError(body.error || 'Failed to load run');
        setLoading(false);
        return;
      }

      const body = await res.json();
      if (cancelled) return;
      setData(body);
      setLoading(false);
    }

    void load();
    const interval = window.setInterval(() => {
      if (!cancelled) void load();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId]);

  useEffect(() => {
    if (forbidden) {
      router.replace('/stats/me');
    }
  }, [forbidden, router]);

  const counts = useMemo(() => {
    const sceneJobs = data?.sceneJobs ?? [];
    return {
      queued: sceneJobs.filter((job) => job.status === 'queued').length,
      processing: sceneJobs.filter((job) => job.status === 'processing').length,
      succeeded: sceneJobs.filter((job) => job.status === 'succeeded').length,
      failed: sceneJobs.filter((job) => job.status === 'failed').length,
    };
  }, [data]);

  const filteredSceneJobs = useMemo(() => {
    const sceneJobs = data?.sceneJobs ?? [];
    if (statusFilter === 'all') return sceneJobs;
    return sceneJobs.filter((job) => job.status === statusFilter);
  }, [data, statusFilter]);

  async function kickoffRun() {
    setActionBusy('kickoff');
    setActionState(null);

    try {
      const res = await fetch(`/api/admin/ai/runs/${runId}/kickoff`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setActionState({ kind: 'error', message: body.error || 'Failed to kickoff run' });
        return;
      }

      const summary = ['queuedJobs', 'processingJobs', 'failedJobs']
        .filter((key) => typeof body[key] === 'number')
        .map((key) => `${key.replace('Jobs', '')}: ${body[key]}`)
        .join(' · ');

      setActionState({
        kind: 'success',
        message: summary ? `${body.status} · ${summary}` : body.status ?? 'Kickoff triggered',
      });
      const refreshRes = await fetch(`/api/admin/ai/runs/${runId}`);
      if (refreshRes.ok) {
        setData(await refreshRes.json());
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function retryFailed() {
    setActionBusy('retry');
    setActionState(null);

    try {
      const res = await fetch(`/api/admin/ai/runs/${runId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retryFailedOnly: true,
          regenerateExisting: false,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setActionState({ kind: 'error', message: body.error || 'Failed to retry failed jobs' });
        return;
      }

      setActionState({
        kind: 'success',
        message: `retry queued · requeued ${body.requeuedCount ?? 0}`,
      });
      const refreshRes = await fetch(`/api/admin/ai/runs/${runId}`);
      if (refreshRes.ok) {
        setData(await refreshRes.json());
      }
    } finally {
      setActionBusy(null);
    }
  }

  if (loading || forbidden) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading run...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-red-400">{error || 'Run not found'}</p>
      </div>
    );
  }

  const { run, failedEntries, skippedEntries } = data;
  const filterHref = (status: string) =>
    status === 'all' ? `/stats/ai/runs/${runId}` : `/stats/ai/runs/${runId}?status=${status}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Link href="/stats/ai" className="text-xs text-muted hover:text-foreground transition-colors">
        &larr; AI Stats
      </Link>

      <div className="mt-3 mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gold">
              {run.scriptTitle}{run.scriptYear ? ` (${run.scriptYear})` : ''}
            </h1>
            <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(run.status)}`}>
              {run.isIdleWithQueuedWork ? 'waiting' : run.status}
            </span>
            {run.isIdleWithQueuedWork && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-300">
                idle with queued work
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-1">
            Run {run.id} · {run.profiles.length} voice{run.profiles.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={kickoffRun}
            disabled={actionBusy !== null}
            className="px-3 py-2 text-xs rounded-xl bg-gold/15 text-gold border border-gold/30 disabled:opacity-50"
          >
            {actionBusy === 'kickoff' ? 'Kicking off...' : 'Kickoff'}
          </button>
          <button
            onClick={retryFailed}
            disabled={actionBusy !== null || counts.failed === 0}
            className="px-3 py-2 text-xs rounded-xl bg-surface text-foreground border border-border disabled:opacity-50"
          >
            {actionBusy === 'retry' ? 'Retrying...' : 'Retry Failed'}
          </button>
        </div>
      </div>

      {actionState && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            actionState.kind === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {actionState.message}
        </div>
      )}

      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Run Summary</h2>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Persisted', value: `${run.persistedLines} / ${run.totalLines}` },
            { label: 'Failed Lines', value: run.failedLines },
            { label: 'Queued Jobs', value: counts.queued },
            { label: 'Processing Jobs', value: counts.processing },
            { label: 'Succeeded Jobs', value: counts.succeeded },
            { label: 'Failed Jobs', value: counts.failed },
          ].map((item) => (
            <div key={item.label} className="bg-background/40 rounded-xl p-4 text-center">
              <p className="text-xl font-bold text-gold">{item.value}</p>
              <p className="text-xs text-muted mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-5 text-xs text-muted mt-4">
          <span>Created: {formatDate(run.createdAt)}</span>
          <span>Started: {formatDate(run.startedAt)}</span>
          <span>Finished: {formatDate(run.finishedAt)}</span>
        </div>

        {run.errorMessage && (
          <p className="text-sm text-red-300 mt-3">{run.errorMessage}</p>
        )}

        {run.isIdleWithQueuedWork && (
          <p className="text-sm text-amber-300 mt-3">
            This run has queued work but no active processing job. The watchdog will retry automatically, and Kickoff can resume it immediately.
          </p>
        )}
      </section>

      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Voices</h2>
        <div className="flex flex-wrap gap-2">
          {run.profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/stats/ai/${profile.id}`}
              className="px-3 py-2 rounded-xl bg-background/40 border border-border text-sm hover:border-gold/40 transition-colors"
            >
              {profile.displayName}
              <span className="text-muted ml-2 text-xs">
                {profile.voicePersonaLabel ?? profile.voicePersonaId ?? 'voice'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-xs text-muted uppercase tracking-wider">Scene Jobs</h2>
          <div className="flex gap-2 flex-wrap text-xs">
            {[
              { key: 'all', label: `All (${data.sceneJobs.length})` },
              { key: 'queued', label: `Queued (${counts.queued})` },
              { key: 'processing', label: `Processing (${counts.processing})` },
              { key: 'failed', label: `Failed (${counts.failed})` },
            ].map((filter) => (
              <Link
                key={filter.key}
                href={filterHref(filter.key)}
                className={`px-2 py-1 rounded-full border transition-colors ${
                  statusFilter === filter.key
                    ? 'border-gold/40 bg-gold/15 text-gold'
                    : 'border-border text-muted hover:border-gold/30 hover:text-foreground'
                }`}
              >
                {filter.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredSceneJobs.length === 0 && (
            <p className="text-sm text-muted">No jobs match this filter.</p>
          )}

          {filteredSceneJobs.map((job) => (
            <div key={job.id} className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium">
                    Scene {job.sceneNumber ?? '?'}{job.sceneHeading ? ` · ${job.sceneHeading}` : ''}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(job.status)}`}>
                    {job.status}
                  </span>
                  {job.isStalled && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-300">
                      stalled
                    </span>
                  )}
                </div>
                <Link
                  href={`/stats/ai/${job.aiProfileId}`}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  {job.aiProfileName}
                </Link>
              </div>

              <div className="flex flex-wrap gap-5 text-xs text-muted mt-2">
                <span>{job.persistedLines} / {job.totalLines} persisted</span>
                <span>{job.failedLines} failed</span>
                <span>{job.progressPct}% progress</span>
                <span>Attempts: {job.attemptCount}</span>
                <span>Updated: {formatDate(job.updatedAt)}</span>
                <span>Started: {formatDate(job.startedAt)}</span>
                <span>Finished: {formatDate(job.finishedAt)}</span>
              </div>

              {job.errorMessage && (
                <p className="text-xs text-red-300 mt-2">{job.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {failedEntries.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 mb-4">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Recent Failures</h2>
          <div className="space-y-2">
            {failedEntries.map((entry) => (
              <div key={entry.id} className="border border-border rounded-xl p-3 text-xs text-muted">
                <div>
                  <span className="text-gold">
                    Scene {entry.sceneNumber ?? '?'}{entry.chunkInScene ? ` · Line ${entry.chunkInScene}` : ''}
                  </span>
                  {' · '}
                  <span>{entry.aiProfileName}</span>
                  {' · '}
                  <span>{entry.character ?? 'Narrator'}</span>
                </div>
                <div className="mt-1">{entry.errorMessage ?? 'Generation failed'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {skippedEntries.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Reused Recordings</h2>
          <div className="space-y-2">
            {skippedEntries.slice(0, 12).map((entry) => (
              <div key={entry.id} className="border border-border rounded-xl p-3 text-xs text-muted">
                <span className="text-gold">
                  Scene {entry.sceneNumber ?? '?'}{entry.chunkInScene ? ` · Line ${entry.chunkInScene}` : ''}
                </span>
                {' · '}
                <span>{entry.aiProfileName}</span>
                {' · '}
                <span>{entry.character ?? 'Narrator'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

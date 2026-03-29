'use client';

import Link from 'next/link';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AiTotals {
  totalProfiles: number;
  activeProfiles: number;
  totalRuns: number;
  totalGeneratedRecordings: number;
  totalPersistedLines: number;
  totalFailedLines: number;
  totalQueuedJobs: number;
  totalProcessingJobs: number;
}

interface AiProfileRow {
  id: string;
  displayName: string;
  status: string;
  platform: string;
  voicePersonaId: string;
  voicePersonaLabel: string | null;
  createdAt: string;
  scriptTitle: string;
  scriptYear: number | null;
  generatedRecordings: number;
  generatedStorageBytes: number;
  persistedLineCount: number;
}

interface AiRunRow {
  id: string;
  scriptTitle: string;
  scriptYear: number | null;
  status: string;
  totalLines: number;
  persistedLines: number;
  failedLines: number;
  skippedLines: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  isIdleWithQueuedWork: boolean;
  sceneJobCounts: {
    queued: number;
    processing: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  };
  failedEntries: Array<{
    character: string | null;
    chunkInScene: number | null;
    sceneNumber: number | null;
    sceneHeading: string | null;
    sourceLine: string;
    errorMessage: string | null;
  }>;
}

function formatStorage(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

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

export default function AiStatsPage() {
  const router = useRouter();
  const [totals, setTotals] = useState<AiTotals | null>(null);
  const [profiles, setProfiles] = useState<AiProfileRow[]>([]);
  const [runs, setRuns] = useState<AiRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch('/api/stats/ai');
      if (cancelled) return;

      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (cancelled) return;
        setTotals(data.totals);
        setProfiles(data.profiles);
        setRuns(data.runs);
      }

      setLoading(false);
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (forbidden) {
      router.replace('/stats/me');
    }
  }, [forbidden, router]);

  if (loading || forbidden) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading AI stats...</p>
      </div>
    );
  }

  function openRun(runId: string) {
    router.push(`/stats/ai/runs/${runId}`);
  }

  function handleRunCardNavigate(event: MouseEvent<HTMLElement>, runId: string) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('a')) {
      return;
    }
    openRun(runId);
  }

  function handleRunCardKeyDown(event: KeyboardEvent<HTMLElement>, runId: string) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('a')) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openRun(runId);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Link href="/stats" className="text-xs text-muted hover:text-foreground transition-colors">
        &larr; Admin Stats
      </Link>

      <h1 className="text-2xl font-bold text-gold mt-3 mb-8">AI Stats</h1>

      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-8 gap-3 mb-10">
          {[
            { label: 'Profiles', value: totals.totalProfiles },
            { label: 'Active', value: totals.activeProfiles },
            { label: 'Runs', value: totals.totalRuns },
            { label: 'AI Recordings', value: totals.totalGeneratedRecordings },
            { label: 'Persisted Lines', value: totals.totalPersistedLines },
            { label: 'Failed Lines', value: totals.totalFailedLines },
            { label: 'Queued Jobs', value: totals.totalQueuedJobs },
            { label: 'Processing Jobs', value: totals.totalProcessingJobs },
          ].map((item) => (
            <div key={item.label} className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gold">{item.value}</p>
              <p className="text-xs text-muted mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Voice Profiles</h2>
          <span className="text-xs text-muted">Managed via admin APIs</span>
        </div>

        <div className="space-y-3">
          {profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/stats/ai/${profile.id}`}
              className="block bg-surface border border-border rounded-xl p-5 hover:border-gold/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium">{profile.displayName}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(profile.status)}`}>
                    {profile.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gold/15 text-gold">
                    {profile.platform}
                  </span>
                </div>
                <span className="text-sm text-muted">
                  {profile.voicePersonaLabel ?? profile.voicePersonaId}
                </span>
              </div>

              <div className="flex flex-wrap gap-5 text-xs text-muted mb-3">
                <span>{profile.scriptTitle}{profile.scriptYear ? ` (${profile.scriptYear})` : ''}</span>
                <span>{profile.generatedRecordings} AI recording{profile.generatedRecordings !== 1 ? 's' : ''}</span>
                <span>{profile.persistedLineCount} persisted line{profile.persistedLineCount !== 1 ? 's' : ''}</span>
                <span>{formatStorage(profile.generatedStorageBytes)}</span>
              </div>

              <div className="text-xs text-muted border-t border-border pt-3">
                Created: {formatDate(profile.createdAt)}
              </div>
            </Link>
          ))}

          {profiles.length === 0 && (
            <p className="text-muted text-center py-8">No AI profiles yet.</p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Generation Runs</h2>
          <span className="text-xs text-muted">Queued scene jobs with recent line failures</span>
        </div>

        <div className="space-y-3">
          {runs.map((run) => (
            <div
              key={run.id}
              role="link"
              tabIndex={0}
              onClick={(event) => handleRunCardNavigate(event, run.id)}
              onKeyDown={(event) => handleRunCardKeyDown(event, run.id)}
              className="bg-surface border border-border rounded-xl p-5 cursor-pointer hover:border-gold/40 transition-colors focus:outline-none focus:ring-2 focus:ring-gold/40"
            >
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href={`/stats/ai/runs/${run.id}`}
                    className="font-medium hover:text-gold transition-colors"
                  >
                    {run.scriptTitle}{run.scriptYear ? ` (${run.scriptYear})` : ''}
                  </Link>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(run.status)}`}>
                    {run.isIdleWithQueuedWork ? 'waiting' : run.status}
                  </span>
                  {run.isIdleWithQueuedWork && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-300">
                      idle with queued work
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">{formatDate(run.createdAt)}</span>
              </div>

              <div className="flex flex-wrap gap-5 text-xs text-muted mb-3">
                <span>{run.persistedLines} / {run.totalLines} persisted</span>
                <span>{run.failedLines} failed</span>
                <span>{run.skippedLines} skipped/reused</span>
                <Link href={`/stats/ai/runs/${run.id}?status=queued`} className="hover:text-gold transition-colors">
                  {run.sceneJobCounts.queued} queued jobs
                </Link>
                <Link href={`/stats/ai/runs/${run.id}?status=processing`} className="hover:text-gold transition-colors">
                  {run.sceneJobCounts.processing} processing jobs
                </Link>
                <span>{run.sceneJobCounts.succeeded} succeeded jobs</span>
                <Link href={`/stats/ai/runs/${run.id}?status=failed`} className="hover:text-gold transition-colors">
                  {run.sceneJobCounts.failed} failed jobs
                </Link>
              </div>

              <div className="flex flex-wrap gap-5 text-xs text-muted mb-3">
                <span>Started: {formatDate(run.startedAt)}</span>
                <span>Finished: {formatDate(run.finishedAt)}</span>
              </div>

              {run.failedEntries.length > 0 && (
                <div className="border-t border-border pt-3 mt-3 space-y-2">
                  <p className="text-xs uppercase tracking-wider text-muted">Recent Failures</p>
                  {run.failedEntries.map((entry, index) => (
                    <div key={`${run.id}-${index}`} className="text-xs text-muted">
                      <span className="text-gold">
                        Scene {entry.sceneNumber ?? '?'}{entry.chunkInScene ? ` · Line ${entry.chunkInScene}` : ''}
                      </span>
                      {' · '}
                      <span>{entry.character ?? 'Narrator'}</span>
                      {' · '}
                      <span>{entry.errorMessage ?? 'Generation failed'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {runs.length === 0 && (
            <p className="text-muted text-center py-8">No generation runs yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

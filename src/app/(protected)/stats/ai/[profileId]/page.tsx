'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import RoleCall from '@/components/stats/role-call';

interface Summary {
  totalRecordings: number;
  uniqueLinesRecorded: number;
  scriptsContributedTo: number;
  typeBreakdown: { dialogue: number; action: number; scene_heading: number; transition: number };
}

interface SceneEntry {
  character: string | null;
  count: number;
  recordingIds: string[];
}

interface RecentScene {
  sceneId: string;
  sceneHeading: string | null;
  scriptTitle: string;
  date: string;
  entries: SceneEntry[];
}

interface CharacterCard {
  character: string;
  scriptId?: string;
  scriptTitle: string;
  scriptYear: number | null;
  scriptSlug: string;
  acts: Array<{ actNumber: number; recorded: number; total: number }>;
  totalRecorded: number;
  totalLines: number;
  completionPct: number;
}

interface RecentRun {
  id: string;
  status: string;
  totalLines: number;
  persistedLines: number;
  failedLines: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  scriptTitle: string;
  scriptYear: number | null;
}

interface RecentFailure {
  id: string;
  errorMessage: string | null;
  sourceLine: string;
  createdAt: string;
  character: string | null;
  chunkInScene: number | null;
  sceneNumber: number | null;
  sceneHeading: string | null;
}

interface VoiceVerificationSample {
  id: string;
  status: string;
  sampleText: string;
  requestedVoicePersonaId: string;
  resolvedVoiceId: string;
  expressiveText: string | null;
  contentType: string | null;
  byteLength: number | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  audioUrl: string | null;
}

interface AiProfileDetail {
  profile: {
    id: string;
    scriptId: string;
    displayName: string;
    status: string;
    platform: string;
    voicePersonaId: string;
    voicePersonaLabel: string | null;
    createdAt: string;
    scriptTitle: string;
    scriptYear: number | null;
    scriptSlug: string | null;
  };
  summary: Summary;
  characters: CharacterCard[];
  recentScenes: RecentScene[];
  recentRuns: RecentRun[];
  recentFailures: RecentFailure[];
  voiceVerificationSamples: VoiceVerificationSample[];
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
    case 'ready':
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

export default function AiProfileStatsPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.profileId as string;

  const [data, setData] = useState<AiProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scenesShown, setScenesShown] = useState(5);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [highlightedSampleId, setHighlightedSampleId] = useState<string | null>(null);
  const voiceVerificationRef = useRef<HTMLElement | null>(null);

  async function reload() {
    const res = await fetch(`/api/stats/ai/${profileId}`);
    if (res.status === 403) {
      router.replace('/stats/me');
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load' }));
      setError(err.error || 'Failed to load');
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [profileId, router]);

  async function verifyVoice() {
    setVerifyBusy(true);
    setVerifyMessage(null);

    try {
      const res = await fetch(`/api/admin/ai/profiles/${profileId}/verify-voice`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setVerifyMessage({ kind: 'error', text: body.error || 'Voice verification failed' });
        return;
      }

      setVerifyMessage({
        kind: 'success',
        text: `Generated fresh sample for ${body.sample?.resolvedVoiceId ?? 'voice audit'}`,
      });
      await reload();
      if (typeof body.sample?.id === 'string') {
        setHighlightedSampleId(body.sample.id);
      }
      window.setTimeout(() => {
        voiceVerificationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } finally {
      setVerifyBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading AI profile...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-red-400">{error || 'Not found'}</p>
      </div>
    );
  }

  const { profile, summary, characters, recentScenes, recentRuns, recentFailures, voiceVerificationSamples } = data;
  const groupedScripts = new Map<string, { title: string; year: number | null; chars: CharacterCard[] }>();
  for (const character of characters) {
    const key = character.scriptId || character.scriptSlug;
    if (!groupedScripts.has(key)) {
      groupedScripts.set(key, { title: character.scriptTitle, year: character.scriptYear, chars: [] });
    }
    groupedScripts.get(key)!.chars.push(character);
  }
  const groups = [...groupedScripts.values()];
  const isGrouped = groups.length > 1;
  const tb = summary.typeBreakdown;
  const tbTotal = tb.dialogue + tb.action + tb.scene_heading + tb.transition;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link href="/stats/ai" className="text-xs text-muted hover:text-foreground transition-colors">
        &larr; AI Stats
      </Link>

      <div className="mt-3 mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gold">{profile.displayName}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(profile.status)}`}>
            {profile.status}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-gold/15 text-gold">
            {profile.platform}
          </span>
        </div>
        <p className="text-sm text-muted mt-1">
          {profile.scriptTitle}{profile.scriptYear ? ` (${profile.scriptYear})` : ''} · {profile.voicePersonaLabel ?? profile.voicePersonaId}
        </p>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={verifyVoice}
            disabled={verifyBusy}
            className="px-3 py-2 text-xs rounded-xl bg-gold/15 text-gold border border-gold/30 disabled:opacity-50"
          >
            {verifyBusy ? 'Generating sample...' : 'Generate Fresh Voice Sample'}
          </button>
          {verifyMessage && (
            <span className={`text-xs ${verifyMessage.kind === 'success' ? 'text-green-300' : 'text-red-300'}`}>
              {verifyMessage.text}
            </span>
          )}
        </div>
      </div>

      <section ref={voiceVerificationRef} className="mb-8 bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <h2 className="text-xs text-muted uppercase tracking-wider">Voice Verification</h2>
          <span className="text-xs text-muted">Fresh samples do not affect scene coverage.</span>
        </div>
        <div className="space-y-3">
          {voiceVerificationSamples.length === 0 && (
            <p className="text-sm text-muted">No voice verification samples yet.</p>
          )}
          {voiceVerificationSamples.map((sample) => (
            <div
              key={sample.id}
              className={`border rounded-xl p-4 ${highlightedSampleId === sample.id ? 'border-gold/50 bg-gold/5' : 'border-border'}`}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(sample.status)}`}>
                    {sample.status}
                  </span>
                  <span className="text-sm text-foreground">
                    requested {sample.requestedVoicePersonaId} -&gt; resolved {sample.resolvedVoiceId}
                  </span>
                </div>
                <span className="text-xs text-muted">{formatDate(sample.createdAt)}</span>
              </div>
              <p className="text-xs text-muted mt-2">{sample.sampleText}</p>
              {sample.audioUrl && (
                <audio controls autoPlay={highlightedSampleId === sample.id} className="mt-3 w-full">
                  <source src={sample.audioUrl} type={sample.contentType ?? 'audio/mpeg'} />
                </audio>
              )}
              {sample.expressiveText && (
                <p className="text-xs text-muted mt-3">Rendered text: {sample.expressiveText}</p>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-muted mt-3">
                <span>Bytes: {sample.byteLength ?? '-'}</span>
                <span>Content-Type: {sample.contentType ?? '-'}</span>
              </div>
              {sample.errorMessage && (
                <p className="text-xs text-red-300 mt-2">{sample.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gold">{summary.totalRecordings}</p>
          <p className="text-xs text-muted mt-1">AI Recordings</p>
        </div>
        <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gold">{characters.length}</p>
          <p className="text-xs text-muted mt-1">Roles Played</p>
        </div>
        <div className="bg-surface border border-gold/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gold">{summary.uniqueLinesRecorded}</p>
          <p className="text-xs text-muted mt-1">Unique Lines</p>
        </div>
      </div>

      <button
        onClick={() => setBreakdownOpen((open) => !open)}
        className="text-xs text-muted/50 hover:text-muted mb-8 transition-colors"
      >
        View breakdown by type {breakdownOpen ? '▴' : '▾'}
      </button>

      {breakdownOpen && tbTotal > 0 && (
        <div className="mb-8">
          <div className="h-3 rounded-full overflow-hidden flex">
            {tb.dialogue > 0 && (
              <div className="bg-gold h-full" style={{ width: `${(tb.dialogue / tbTotal) * 100}%` }} />
            )}
            {tb.action > 0 && (
              <div className="bg-amber-700 h-full" style={{ width: `${(tb.action / tbTotal) * 100}%` }} />
            )}
            {tb.scene_heading > 0 && (
              <div className="bg-purple-400 h-full" style={{ width: `${(tb.scene_heading / tbTotal) * 100}%` }} />
            )}
            {tb.transition > 0 && (
              <div className="bg-cyan-400 h-full" style={{ width: `${(tb.transition / tbTotal) * 100}%` }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
            {tb.dialogue > 0 && <span className="text-gold">{tb.dialogue} dialogue</span>}
            {tb.action > 0 && <span className="text-amber-700">{tb.action} action</span>}
            {tb.scene_heading > 0 && <span className="text-purple-400">{tb.scene_heading} scene heading</span>}
            {tb.transition > 0 && <span className="text-cyan-400">{tb.transition} transition</span>}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.title}>
          {isGrouped && (
            <h2 className="text-sm font-medium text-muted mb-2">
              {group.title}{group.year ? ` (${group.year})` : ''}
            </h2>
          )}
          <p className="text-xs text-muted/50 mb-2">Sorted by most recorded</p>
          <RoleCall characters={group.chars} grouped={isGrouped} allowContinue={false} />
        </div>
      ))}

      {recentScenes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Recent Scenes</h2>
          <div className="space-y-3">
            {recentScenes.slice(0, scenesShown).map((scene) => (
              <Link
                key={`${scene.sceneId}-${scene.date}`}
                href={`/panel/${scene.sceneId}`}
                className="block bg-surface border border-border rounded-2xl p-4 hover:border-gold/40 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">
                  {scene.sceneHeading || 'Unknown scene'}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {scene.scriptTitle} · {new Date(`${scene.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
                <div className="mt-2 space-y-0.5">
                  {scene.entries.map((entry) => (
                    <p key={entry.character ?? '__narrator__'} className="text-xs text-muted">
                      <span className={entry.character ? 'text-gold' : 'text-muted/60'}>
                        {entry.character ?? 'Narrator'}
                      </span>{' '}
                      ×{entry.count}
                    </p>
                  ))}
                </div>
              </Link>
            ))}
          </div>
          {scenesShown < recentScenes.length && (
            <button
              onClick={() => setScenesShown((count) => count + 5)}
              className="w-full mt-3 py-2 text-xs text-muted hover:text-gold transition-colors bg-surface border border-border rounded-xl"
            >
              Show more
            </button>
          )}
        </section>
      )}

      <section className="mt-10 bg-surface border border-border rounded-2xl p-5">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Recent Generation Runs</h2>
        <div className="space-y-3">
          {recentRuns.length === 0 && (
            <p className="text-sm text-muted">No generation runs yet.</p>
          )}
          {recentRuns.map((run) => (
            <div key={run.id} className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium">{run.scriptTitle}{run.scriptYear ? ` (${run.scriptYear})` : ''}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <span className="text-xs text-muted">{formatDate(run.createdAt)}</span>
              </div>
              <div className="flex flex-wrap gap-5 text-xs text-muted mt-2">
                <span>{run.persistedLines} / {run.totalLines} persisted</span>
                <span>{run.failedLines} failed</span>
                <span>Started: {formatDate(run.startedAt)}</span>
                <span>Finished: {formatDate(run.finishedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {recentFailures.length > 0 && (
        <section className="mt-4 bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Recent Failures</h2>
          <div className="space-y-2">
            {recentFailures.map((failure) => (
              <div key={failure.id} className="text-xs text-muted border border-border rounded-xl p-3">
                <div className="mb-1">
                  <span className="text-gold">
                    Scene {failure.sceneNumber ?? '?'}{failure.chunkInScene ? ` · Line ${failure.chunkInScene}` : ''}
                  </span>{' '}
                  · <span>{failure.character ?? 'Narrator'}</span> · <span>{formatDate(failure.createdAt)}</span>
                </div>
                <div>{failure.errorMessage ?? 'Generation failed'}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

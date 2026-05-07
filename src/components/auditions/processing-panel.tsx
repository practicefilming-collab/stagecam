'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AuditionProcessingPreview,
  AuditionProcessingRoleBrief,
  AuditionProcessingScenePreview,
} from '@/lib/auditions/processing';

interface AuditionAiState {
  linkedScript: { id: string; title: string; slug: string };
  profiles: Array<{
    id: string;
    display_name: string;
    voice_persona_id: string;
    voice_persona_label: string | null;
    status: string;
  }>;
  runs: Array<{
    id: string;
    status: string;
    total_lines: number;
    persisted_lines: number;
    failed_lines: number;
    created_at: string;
  }>;
}

function splitRolesCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AuditionProcessingPanel({
  auditionId,
  canManage,
  linkedScriptId,
  initialAiState,
}: {
  auditionId: string;
  canManage: boolean;
  linkedScriptId: string | null;
  initialAiState: AuditionAiState | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<AuditionProcessingPreview | null>(null);
  const [aiState, setAiState] = useState<AuditionAiState | null>(initialAiState);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAiState() {
    if (!canManage) return;
    const res = await fetch(`/api/auditions/${auditionId}/ai`);
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setAiState(payload);
    }
  }

  function updateScene(index: number, patch: Partial<AuditionProcessingScenePreview>) {
    setPreview((current) => {
      if (!current) return current;
      const scenes = current.scenes.map((scene, sceneIndex) =>
        sceneIndex === index ? { ...scene, ...patch } : scene,
      );
      return { ...current, scenes };
    });
  }

  function updateRoleBrief(index: number, patch: Partial<AuditionProcessingRoleBrief>) {
    setPreview((current) => {
      if (!current) return current;
      const roleBriefs = current.roleBriefs.map((brief, briefIndex) =>
        briefIndex === index ? { ...brief, ...patch } : brief,
      );
      return { ...current, roleBriefs };
    });
  }

  if (!canManage) return null;

  async function analyze() {
    setLoadingPreview(true);
    setError('');
    setMessage('');
    const res = await fetch(`/api/auditions/${auditionId}/process/preview`, { method: 'POST' });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Preview failed');
      setLoadingPreview(false);
      return;
    }
    setPreview(payload);
    setMessage('Processing preview ready. Review and edit before apply.');
    setLoadingPreview(false);
  }

  async function apply() {
    if (!preview) return;
    setSaving(true);
    setError('');
    setMessage('');
    const res = await fetch(`/api/auditions/${auditionId}/process/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Apply failed');
      setSaving(false);
      return;
    }
    setMessage('Applied reviewed preview to the private audition and hidden shared script.');
    setSaving(false);
    await loadAiState();
    router.refresh();
  }

  async function createProfiles() {
    setSaving(true);
    setError('');
    setMessage('');
    const res = await fetch(`/api/auditions/${auditionId}/ai`, { method: 'POST' });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Profile creation failed');
      setSaving(false);
      return;
    }
    setAiState((prev) =>
      prev
        ? { ...prev, profiles: payload.profiles }
        : initialAiState
          ? { ...initialAiState, profiles: payload.profiles }
          : null,
    );
    setMessage('AI profiles synchronized.');
    setSaving(false);
  }

  async function runAi() {
    setSaving(true);
    setError('');
    setMessage('');
    const res = await fetch(`/api/auditions/${auditionId}/ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerateExisting: false }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'AI run failed to start');
      setSaving(false);
      return;
    }
    setMessage(`AI run queued (${payload.totalLines} lines across ${payload.jobsCreated} jobs).`);
    setSaving(false);
    await loadAiState();
  }

  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Processing Assist</h2>
          <p className="mt-1 text-sm text-muted">
            Analyze the uploaded source, edit the proposed scenes and briefs, then apply that reviewed draft into the private audition and hidden shared-script AI path.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={analyze}
            disabled={loadingPreview || saving}
            className="rounded-xl border border-gold/40 px-4 py-2 text-sm text-gold hover:bg-gold/10 disabled:opacity-50"
          >
            {loadingPreview ? 'Analyzing...' : 'Analyze source'}
          </button>
          <button
            onClick={() => void loadAiState()}
            disabled={!linkedScriptId || saving}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            Refresh AI state
          </button>
          <button
            onClick={apply}
            disabled={!preview || saving}
            className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
          >
            {saving ? 'Working...' : 'Apply reviewed draft'}
          </button>
          <button
            onClick={createProfiles}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            Sync AI profiles
          </button>
          <button
            onClick={runAi}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            Start Grok read
          </button>
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-green-400">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {aiState && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-border bg-background/40 p-4">
            <div className="text-xs uppercase tracking-wide text-gold/80">Hidden shared script</div>
            <div className="mt-2 text-sm font-medium">{aiState.linkedScript.title}</div>
            <div className="mt-1 text-xs text-muted">{aiState.linkedScript.slug}</div>
            <div className="mt-4 space-y-2">
              {aiState.profiles.map((profile) => (
                <div key={profile.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                  {profile.display_name} · {profile.voice_persona_label ?? profile.voice_persona_id} · {profile.status}
                </div>
              ))}
              {aiState.profiles.length === 0 && <p className="text-sm text-muted">No AI profiles yet.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background/40 p-4">
            <div className="text-xs uppercase tracking-wide text-gold/80">Recent runs</div>
            <div className="mt-4 space-y-2">
              {aiState.runs.map((run) => (
                <div key={run.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                  {run.status} · {run.persisted_lines}/{run.total_lines} persisted · {run.failed_lines} failed
                </div>
              ))}
              {aiState.runs.length === 0 && <p className="text-sm text-muted">No AI runs queued yet.</p>}
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-border bg-background/40 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-gold/80">Role briefs</div>
              <div className="text-xs text-muted">Editable before apply</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {preview.roleBriefs.map((brief, index) => (
                <div key={brief.roleName} className="rounded-2xl border border-border p-4 space-y-3">
                  <input
                    value={brief.roleName}
                    onChange={(event) => updateRoleBrief(index, { roleName: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={brief.voiceLabel}
                      onChange={(event) => updateRoleBrief(index, { voiceLabel: event.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                      placeholder="Voice label"
                    />
                    <input
                      value={brief.voiceId}
                      onChange={(event) => updateRoleBrief(index, { voiceId: event.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                      placeholder="Voice ID"
                    />
                  </div>
                  <textarea
                    value={brief.rationale}
                    onChange={(event) => updateRoleBrief(index, { rationale: event.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Rationale"
                  />
                  <input
                    value={brief.defaultTone}
                    onChange={(event) => updateRoleBrief(index, { defaultTone: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Default tone"
                  />
                  <input
                    value={brief.defaultPacing}
                    onChange={(event) => updateRoleBrief(index, { defaultPacing: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Default pacing"
                  />
                  <textarea
                    value={brief.emphasisGuidance}
                    onChange={(event) => updateRoleBrief(index, { emphasisGuidance: event.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Emphasis guidance"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {preview.scenes.map((scene, index) => (
              <div key={scene.orderIndex} className="rounded-2xl border border-border bg-background/40 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={scene.label}
                    onChange={(event) => updateScene(index, { label: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Scene label"
                  />
                  <input
                    value={scene.sourcePageRef}
                    onChange={(event) => updateScene(index, { sourcePageRef: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Source reference"
                  />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <textarea
                    value={scene.sceneObjective}
                    onChange={(event) => updateScene(index, { sceneObjective: event.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Scene objective"
                  />
                  <textarea
                    value={scene.dramaticPurpose}
                    onChange={(event) => updateScene(index, { dramaticPurpose: event.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Dramatic purpose"
                  />
                  <textarea
                    value={scene.emotionalTemperature}
                    onChange={(event) => updateScene(index, { emotionalTemperature: event.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Emotional temperature"
                  />
                  <textarea
                    value={scene.subtext}
                    onChange={(event) => updateScene(index, { subtext: event.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                    placeholder="Subtext"
                  />
                </div>

                <textarea
                  value={scene.rehearsalEmphasis}
                  onChange={(event) => updateScene(index, { rehearsalEmphasis: event.target.value })}
                  rows={2}
                  className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  placeholder="Rehearsal emphasis"
                />

                <input
                  value={scene.roleNames.join(', ')}
                  onChange={(event) => updateScene(index, { roleNames: splitRolesCsv(event.target.value) })}
                  className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  placeholder="Roles, comma separated"
                />

                <textarea
                  value={scene.sceneText}
                  onChange={(event) => updateScene(index, { sceneText: event.target.value })}
                  rows={14}
                  className="mt-3 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-7 focus:outline-none focus:border-gold/50"
                  placeholder="Prepared scene text"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

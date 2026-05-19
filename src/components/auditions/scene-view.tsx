'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AuditionAttempt, AuditionProgressionStep, AuditionRole } from '@/lib/types';
import type {
  AuditionDetail,
  AuditionSceneWithRoles,
  AuditionTakeDetail,
  AuditionTakeSummary,
} from '@/lib/auditions/data';
import { summarizeSceneReadiness } from '@/lib/auditions/scene-runtime';

const STEPS: AuditionProgressionStep[] = [
  'scene_familiarization',
  'line_lock',
  'cue_confidence',
  'room_ready',
];

function renderTakeReview(selectedTake: AuditionTakeDetail | null): ReactNode {
  if (!selectedTake) {
    return (
      <p className="mt-4 text-sm text-muted">Choose a take to review its cast plan and recorded clips.</p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-border bg-background/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-medium">{selectedTake.title ?? `Take ${selectedTake.id.slice(0, 8)}`}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-gold/80">{selectedTake.status}</div>
          </div>
          <div className="text-xs text-muted">{new Date(selectedTake.created_at).toLocaleString()}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {selectedTake.assignments.map((assignment) => (
            <span key={assignment.id} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
              {assignment.role_name} • {assignment.assignment_type === 'fallback_audio' ? 'fallback' : 'human'}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background/40 p-4">
        <h3 className="text-sm font-semibold">Recorded clips</h3>
        <div className="mt-4 space-y-4">
          {selectedTake.clips.map((clip) => (
            <div key={clip.id} className="rounded-2xl border border-border bg-surface/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{clip.role_name}</div>
                  <div className="mt-1 text-xs text-muted">{clip.line_text}</div>
                </div>
                <div className="text-xs text-muted">{new Date(clip.created_at).toLocaleString()}</div>
              </div>
              {clip.signed_url ? (
                <video src={clip.signed_url} controls className="mt-3 w-full rounded-xl bg-black" />
              ) : (
                <p className="mt-3 text-xs text-muted">Clip preview unavailable.</p>
              )}
            </div>
          ))}
          {selectedTake.clips.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              No clips uploaded yet for this take.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuditionSceneView({
  detail,
  scene,
  attempts,
  takes,
  viewerUserId,
  canManage,
}: {
  detail: AuditionDetail;
  scene: AuditionSceneWithRoles;
  attempts: AuditionAttempt[];
  takes: AuditionTakeSummary[];
  viewerUserId: string;
  canManage: boolean;
}) {
  const [label, setLabel] = useState(scene.label);
  const [sourcePageRef, setSourcePageRef] = useState(scene.source_page_ref ?? '');
  const [sceneText, setSceneText] = useState(scene.scene_text);
  const [rolesCsv, setRolesCsv] = useState(scene.roles.map((role) => role.name).join(', '));
  const [processingMetadata, setProcessingMetadata] = useState<Record<string, unknown>>(scene.processing_metadata ?? {});
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(takes[0]?.id ?? null);
  const [selectedTake, setSelectedTake] = useState<AuditionTakeDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const selectedRoleName = detail.targetRole?.selected_role_name ?? scene.roles[0]?.name ?? '';
  const progressRows = useMemo(
    () => detail.progress.filter((row) =>
      row.audition_scene_id === scene.id && row.selected_role_name === selectedRoleName,
    ),
    [detail.progress, scene.id, selectedRoleName],
  );
  const progressMap = new Map(progressRows.map((row) => [row.progression_step, row]));
  const isAssignedRehearser = detail.script.assigned_rehearser_user_id === viewerUserId;
  const readiness = useMemo(
    () => summarizeSceneReadiness(
      { ...scene, scene_text: sceneText, processing_metadata: processingMetadata },
      rolesCsv.split(',').map((item) => item.trim()).filter(Boolean),
    ),
    [processingMetadata, rolesCsv, scene, sceneText],
  );

  useEffect(() => {
    if (!selectedTakeId) {
      setSelectedTake(null);
      return;
    }

    const load = async () => {
      const res = await fetch(`/api/auditions/takes/${selectedTakeId}`);
      if (!res.ok) return;
      const payload = await res.json();
      setSelectedTake(payload);
    };

    void load();
  }, [selectedTakeId]);

  const saveScene = async () => {
    setSaving(true);
    setError('');

    const sceneRes = await fetch(`/api/auditions/${detail.script.id}/scenes/${scene.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        source_page_ref: sourcePageRef,
        scene_text: sceneText,
        processing_metadata: processingMetadata,
      }),
    });

    const rolesRes = await fetch(`/api/auditions/${detail.script.id}/scenes/${scene.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: rolesCsv.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });

    if (!sceneRes.ok || !rolesRes.ok) {
      setError('Could not save scene changes');
      setSaving(false);
      return;
    }

    setSuccess('Scene updates saved.');
    setSaving(false);
    router.refresh();
  };

  const toggleStep = async (step: AuditionProgressionStep, isComplete: boolean) => {
    setSaving(true);
    const res = await fetch(`/api/auditions/${detail.script.id}/scenes/${scene.id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progression_step: step,
        selected_role_name: selectedRoleName,
        is_complete: isComplete,
      }),
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.error || 'Could not update progress');
      setSaving(false);
      return;
    }

    setSuccess(isComplete ? `Marked ${step.replace(/_/g, ' ')} complete.` : `Reopened ${step.replace(/_/g, ' ')}.`);
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Scene takes</p>
          <h1 className="mt-2 text-3xl font-bold text-gold">{scene.label}</h1>
          <p className="mt-2 text-sm text-muted">
            {detail.script.title} {scene.source_page_ref ? `• ${scene.source_page_ref}` : ''}
          </p>
        </div>
        <div className="rounded-full border border-gold/30 px-4 py-2 text-xs text-gold">
          {readiness.level.replace(/_/g, ' ')}
        </div>
      </div>

      {success && <p className="text-sm text-green-400">{success}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="mb-4 flex flex-wrap gap-2">
              {scene.roles.map((role: AuditionRole) => (
                <span
                  key={role.id}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    role.name === selectedRoleName
                      ? 'border-gold/40 bg-gold/10 text-gold'
                      : 'border-border text-muted'
                  }`}
                >
                  {role.name}
                </span>
              ))}
            </div>
            <div className="whitespace-pre-wrap rounded-2xl border border-border bg-background/40 p-5 text-sm leading-7 text-foreground">
              {scene.scene_text}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Take ledger</h2>
            <p className="mt-1 text-sm text-muted">
              Each take is a full scene run. Start new ones from the audition room, then review them here in chronological order.
            </p>
            <div className="mt-4 space-y-3">
              {takes.map((take) => (
                <div
                  key={take.id}
                  className={`overflow-hidden rounded-2xl border transition-colors ${
                    selectedTakeId === take.id
                      ? 'border-gold/40 bg-gold/10'
                      : 'border-border bg-background/40 hover:border-gold/20'
                  }`}
                >
                  <button
                    onClick={() => setSelectedTakeId(take.id)}
                    className="w-full px-4 py-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{take.title ?? `Take ${take.id.slice(0, 8)}`}</div>
                        <div className="mt-1 text-xs uppercase tracking-wide text-gold/80">{take.status}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {take.assignments.map((assignment) => (
                            <span key={assignment.id} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted">
                              {assignment.role_name} • {assignment.assignment_type === 'fallback_audio' ? 'fallback' : 'human'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <div>{new Date(take.created_at).toLocaleString()}</div>
                        <div className="mt-1">{take.clipCount} clips</div>
                      </div>
                    </div>
                  </button>
                  {selectedTakeId === take.id && (
                    <div className="border-t border-gold/20 px-4 pb-4 lg:hidden">
                      {renderTakeReview(selectedTake)}
                    </div>
                  )}
                </div>
              ))}
              {takes.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  No takes have been recorded for this scene yet.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Private Progress</h2>
            <p className="mt-1 text-sm text-muted">
              Steps for {selectedRoleName || 'the selected role'}.
            </p>
            <div className="mt-4 space-y-3">
              {STEPS.map((step) => {
                const completed = progressMap.get(step)?.is_complete ?? false;
                return (
                  <button
                    key={step}
                    onClick={() => toggleStep(step, !completed)}
                    disabled={!isAssignedRehearser && !canManage}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                      completed
                        ? 'border-green-500/30 bg-green-500/10 text-green-300'
                        : 'border-border bg-background/40 text-foreground hover:border-gold/30'
                    } disabled:opacity-60`}
                  >
                    <span className="text-sm font-medium">{step.replace(/_/g, ' ')}</span>
                    <span className="text-xs uppercase tracking-wide">{completed ? 'Complete' : 'Open'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {attempts.length > 0 && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Legacy attempts</h2>
              <div className="mt-4 space-y-3">
                {attempts.map((attempt) => (
                  <div key={attempt.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="text-sm font-medium">{attempt.practice_mode.replace(/_/g, ' ')}</div>
                    {attempt.notes && <p className="mt-2 text-sm text-muted">{attempt.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="hidden rounded-3xl border border-border bg-surface p-6 lg:block">
            <h2 className="text-lg font-semibold">Selected take</h2>
            {renderTakeReview(selectedTake)}
          </div>

          {canManage && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Admin edit</h2>
              <div className="mt-4 space-y-3">
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-gold/50 focus:outline-none"
                />
                <input
                  value={sourcePageRef}
                  onChange={(event) => setSourcePageRef(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-gold/50 focus:outline-none"
                  placeholder="Source page ref"
                />
                <textarea
                  value={sceneText}
                  onChange={(event) => setSceneText(event.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-gold/50 focus:outline-none"
                />
                <input
                  value={rolesCsv}
                  onChange={(event) => setRolesCsv(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-gold/50 focus:outline-none"
                  placeholder="Roles, comma separated"
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    onClick={() => setProcessingMetadata((prev) => ({ ...prev, readiness_level: 'level_1_ready' }))}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
                  >
                    Mark Level 1
                  </button>
                  <button
                    onClick={() => setProcessingMetadata((prev) => {
                      const ai = (prev.ai && typeof prev.ai === 'object') ? prev.ai as Record<string, unknown> : {};
                      return { ...prev, readiness_level: 'level_2_ready', ai: { ...ai, level2_ready: true } };
                    })}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
                  >
                    Mark Level 2
                  </button>
                  <button
                    onClick={() => setProcessingMetadata((prev) => {
                      const ai = (prev.ai && typeof prev.ai === 'object') ? prev.ai as Record<string, unknown> : {};
                      return { ...prev, readiness_level: 'level_3_ready', ai: { ...ai, level2_ready: true, level3_ready: true } };
                    })}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
                  >
                    Mark Level 3
                  </button>
                </div>
                <button
                  onClick={saveScene}
                  disabled={saving}
                  className="rounded-xl border border-gold/40 px-4 py-3 text-sm font-medium text-gold hover:bg-gold/10 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save scene'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

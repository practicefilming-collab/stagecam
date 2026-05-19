'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuditionAttempt, AuditionProgressionStep, AuditionRole } from '@/lib/types';
import type {
  AuditionDetail,
  AuditionSceneWithRoles,
  AuditionTakeSummary,
} from '@/lib/auditions/data';
import { summarizeSceneReadiness } from '@/lib/auditions/scene-runtime';

const STEPS: AuditionProgressionStep[] = [
  'scene_familiarization',
  'line_lock',
  'cue_confidence',
  'room_ready',
];

export function AuditionSceneView({
  detail,
  scene,
  attempts,
  takes,
  viewerUserId,
  canManage,
  canHostRoom,
}: {
  detail: AuditionDetail;
  scene: AuditionSceneWithRoles;
  attempts: AuditionAttempt[];
  takes: AuditionTakeSummary[];
  viewerUserId: string;
  canManage: boolean;
  canHostRoom: boolean;
}) {
  const [label, setLabel] = useState(scene.label);
  const [sourcePageRef, setSourcePageRef] = useState(scene.source_page_ref ?? '');
  const [sceneText, setSceneText] = useState(scene.scene_text);
  const [rolesCsv, setRolesCsv] = useState(scene.roles.map((role) => role.name).join(', '));
  const [processingMetadata, setProcessingMetadata] = useState<Record<string, unknown>>(scene.processing_metadata ?? {});
  const [saving, setSaving] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
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

  const startNewRehearsal = async () => {
    setRoomLoading(true);
    setError('');

    const res = await fetch(`/api/auditions/${detail.script.id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_scene_id: scene.id, status: 'active' }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || 'Could not start rehearsal');
      setRoomLoading(false);
      return;
    }

    router.push(`/rooms/auditions/${payload.room_code}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Scene rehearsals</p>
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
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Rehearsal ledger</h2>
                <p className="mt-1 text-sm text-muted">
                  Each rehearsal is a full scene run. Start a new one, then open any saved rehearsal to replay the whole scene.
                </p>
              </div>
              {canHostRoom && (
                <button
                  onClick={() => void startNewRehearsal()}
                  disabled={roomLoading}
                  className="rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
                >
                  {roomLoading ? 'Starting rehearsal...' : 'Start new rehearsal'}
                </button>
              )}
            </div>
            <div className="mt-4 space-y-3">
              {takes.map((take, index) => {
                const rehearsalNumber = takes.length - index;
                return (
                  <Link
                    key={take.id}
                    href={`/pro/auditions/${detail.script.id}/scenes/${scene.id}/takes/${take.id}`}
                    className="block rounded-2xl border border-border bg-background/40 px-4 py-4 transition-colors hover:border-gold/20 hover:bg-gold/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{`Rehearsal #${rehearsalNumber}`}</div>
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
                  </Link>
                );
              })}
              {takes.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  No rehearsals have been recorded for this scene yet.
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
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Rehearsal review</h2>
            <p className="mt-2 text-sm text-muted">
              Click a rehearsal in the ledger to open a dedicated replay page for the full scene, following the Toy Story review flow.
            </p>
            {canHostRoom && (
              <button
                onClick={() => void startNewRehearsal()}
                disabled={roomLoading}
                className="mt-4 rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground disabled:opacity-50"
              >
                {roomLoading ? 'Starting rehearsal...' : 'Start new rehearsal'}
              </button>
            )}
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

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuditionAttempt, AuditionProgressionStep, AuditionPracticeMode, AuditionRole } from '@/lib/types';
import type { AuditionDetail, AuditionSceneWithRoles } from '@/lib/auditions/data';

const STEPS: AuditionProgressionStep[] = [
  'scene_familiarization',
  'line_lock',
  'cue_confidence',
  'room_ready',
];

const MODES: AuditionPracticeMode[] = [
  'guided_read',
  'cue_response',
  'room_rehearsal',
];

export function AuditionSceneView({
  detail,
  scene,
  attempts,
  viewerUserId,
  canManage,
}: {
  detail: AuditionDetail;
  scene: AuditionSceneWithRoles;
  attempts: AuditionAttempt[];
  viewerUserId: string;
  canManage: boolean;
}) {
  const [label, setLabel] = useState(scene.label);
  const [sourcePageRef, setSourcePageRef] = useState(scene.source_page_ref ?? '');
  const [sceneText, setSceneText] = useState(scene.scene_text);
  const [rolesCsv, setRolesCsv] = useState(scene.roles.map((role) => role.name).join(', '));
  const [attemptMode, setAttemptMode] = useState<AuditionPracticeMode>('guided_read');
  const [attemptStep, setAttemptStep] = useState<AuditionProgressionStep>('scene_familiarization');
  const [attemptNotes, setAttemptNotes] = useState('');
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

  const addAttempt = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch(`/api/auditions/${detail.script.id}/scenes/${scene.id}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        practice_mode: attemptMode,
        progression_step: attemptStep,
        selected_role_name: selectedRoleName,
        notes: attemptNotes,
        completed: true,
      }),
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.error || 'Could not save take');
      setSaving(false);
      return;
    }

    setAttemptNotes('');
    setSuccess('Take saved.');
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Scene rehearsal</p>
          <h1 className="mt-2 text-3xl font-bold text-gold">{scene.label}</h1>
          <p className="mt-2 text-sm text-muted">
            {detail.script.title} {scene.source_page_ref ? `• ${scene.source_page_ref}` : ''}
          </p>
        </div>
      </div>

      {success && <p className="text-sm text-green-400">{success}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
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

          {canManage && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Admin edit</h2>
              <div className="mt-4 space-y-3">
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                />
                <input
                  value={sourcePageRef}
                  onChange={(event) => setSourcePageRef(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  placeholder="Source page ref"
                />
                <textarea
                  value={sceneText}
                  onChange={(event) => setSceneText(event.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                />
                <input
                  value={rolesCsv}
                  onChange={(event) => setRolesCsv(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  placeholder="Roles, comma separated"
                />
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

        <div className="space-y-6">
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

          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Add Take</h2>
            <form onSubmit={addAttempt} className="mt-4 space-y-3">
              <select
                value={attemptMode}
                onChange={(event) => setAttemptMode(event.target.value as AuditionPracticeMode)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
              >
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <select
                value={attemptStep}
                onChange={(event) => setAttemptStep(event.target.value as AuditionProgressionStep)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
              >
                {STEPS.map((step) => (
                  <option key={step} value={step}>{step.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <textarea
                value={attemptNotes}
                onChange={(event) => setAttemptNotes(event.target.value)}
                placeholder="Notes for this take"
                rows={4}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
              />
              <button
                type="submit"
                disabled={saving || (!isAssignedRehearser && !canManage)}
                className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save take'}
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Take History</h2>
            <div className="mt-4 space-y-3">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="rounded-2xl border border-border bg-background/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{attempt.practice_mode.replace(/_/g, ' ')}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-gold/80">
                        {attempt.progression_step.replace(/_/g, ' ')}
                      </div>
                      {attempt.notes && <p className="mt-2 text-sm text-muted">{attempt.notes}</p>}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(attempt.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {attempts.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  No takes saved yet for this scene.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

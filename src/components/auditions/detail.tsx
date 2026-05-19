'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuditionDetail } from '@/lib/auditions/data';
import { summarizeSceneReadiness } from '@/lib/auditions/scene-runtime';
import type { AuditionProgressionStep } from '@/lib/types';
import { getAuditionStatusDescription, getAuditionStatusLabel } from '@/lib/auditions/status';
import { AuditionProcessingPanel } from './processing-panel';

interface UploadUser {
  id: string;
  display_name: string;
}

const STEP_ORDER: AuditionProgressionStep[] = [
  'scene_familiarization',
  'line_lock',
  'cue_confidence',
  'room_ready',
];

export function AuditionDetailView({
  initialDetail,
  canManage,
  canHostRoom,
  uploadUsers,
  initialAiState,
  relationshipLabel,
}: {
  initialDetail: AuditionDetail;
  canManage: boolean;
  canHostRoom: boolean;
  uploadUsers: UploadUser[];
  initialAiState: {
    linkedScript: { id: string; title: string; slug: string };
    profiles: Array<{
      id: string;
      display_name: string;
      voice_persona_id: string;
      voice_persona_label: string | null;
      status: string;
      metadata?: Record<string, unknown>;
    }>;
    runs: Array<{
      id: string;
      status: string;
      total_lines: number;
      persisted_lines: number;
      failed_lines: number;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
    }>;
  } | null;
  relationshipLabel: string | null;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [title, setTitle] = useState(initialDetail.script.title);
  const [sourceLabel, setSourceLabel] = useState(initialDetail.script.source_label);
  const [assignedUserId, setAssignedUserId] = useState(initialDetail.script.assigned_rehearser_user_id);
  const [status, setStatus] = useState(initialDetail.script.status);
  const [newScene, setNewScene] = useState({ label: '', source_page_ref: '', scene_text: '', rolesCsv: '' });
  const [saving, setSaving] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const targetRoleOptions = useMemo(() => {
    const byName = new Map<string, { id: string; name: string }>();
    for (const role of detail.scenes.flatMap((scene) => scene.roles)) {
      if (!byName.has(role.name)) {
        byName.set(role.name, { id: role.id, name: role.name });
      }
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [detail.scenes]);

  const progressByScene = useMemo(() => {
    const map = new Map<string, number>();
    const selectedRoleName = detail.targetRole?.selected_role_name;
    for (const scene of detail.scenes) {
      const count = detail.progress.filter((row) =>
        row.audition_scene_id === scene.id &&
        row.is_complete &&
        (!selectedRoleName || row.selected_role_name === selectedRoleName),
      ).length;
      map.set(scene.id, count);
    }
    return map;
  }, [detail.progress, detail.scenes, detail.targetRole]);

  const saveMeta = async () => {
    setSaving(true);
    setError('');

    const res = await fetch(`/api/auditions/${detail.script.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        source_label: sourceLabel,
        assigned_rehearser_user_id: assignedUserId,
        status,
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Save failed');
      setSaving(false);
      return;
    }

    setDetail((prev) => ({
      ...prev,
      script: payload,
    }));
    setSuccess('Audition metadata saved.');
    setSaving(false);
    router.refresh();
  };

  const addScene = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch(`/api/auditions/${detail.script.id}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: newScene.label,
        source_page_ref: newScene.source_page_ref,
        scene_text: newScene.scene_text,
        roles: newScene.rolesCsv.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Could not add scene');
      setSaving(false);
      return;
    }

    setNewScene({ label: '', source_page_ref: '', scene_text: '', rolesCsv: '' });
    setSuccess(`Added scene "${payload.label}".`);
    setSaving(false);
    router.refresh();
  };

  const reorderScenes = async (sceneIds: string[]) => {
    const res = await fetch(`/api/auditions/${detail.script.id}/scenes/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene_ids: sceneIds }),
    });
    if (res.ok) {
      setSuccess('Scene order updated.');
      router.refresh();
    }
  };

  const selectTargetRole = async (roleId: string) => {
    const res = await fetch(`/api/auditions/${detail.script.id}/target-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audition_role_id: roleId }),
    });

    if (res.ok) {
      setSuccess('Target role updated.');
      router.refresh();
    }
  };

  const launchRoom = async (sceneId: string) => {
    setRoomLoading(true);
    setError('');
    const res = await fetch(`/api/auditions/${detail.script.id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_scene_id: sceneId, status: 'active' }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Could not launch room');
      setRoomLoading(false);
      return;
    }
    router.push(`/rooms/auditions/${payload.room_code}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Private Audition</p>
          <h1 className="mt-2 text-3xl font-bold text-gold">{detail.script.title}</h1>
          <p className="mt-2 text-sm text-muted">{detail.script.source_label}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full border border-border px-3 py-1">{getAuditionStatusLabel(detail.script.status)}</span>
            {detail.assignedRehearser && (
              <span className="rounded-full border border-border px-3 py-1">
                Assigned: {detail.assignedRehearser.display_name}
              </span>
            )}
            {relationshipLabel && (
              <span className="rounded-full border border-border px-3 py-1">
                Relation: {relationshipLabel}
              </span>
            )}
            {detail.processor && (
              <span className="rounded-full border border-border px-3 py-1">
                Processed by {detail.processor.display_name}
              </span>
            )}
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            {getAuditionStatusDescription(detail.script.status)}
          </p>
        </div>

        {canHostRoom && detail.scenes.length > 0 && (
          <button
            onClick={() => launchRoom(detail.scenes[0].id)}
            disabled={roomLoading}
            className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
          >
            {roomLoading ? 'Starting room...' : 'Start Audition Room'}
          </button>
        )}
      </div>

      {success && <p className="text-sm text-green-400">{success}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <AuditionProcessingPanel
        auditionId={detail.script.id}
        canManage={canManage}
        linkedScriptId={detail.linkedScript?.id ?? null}
        initialAiState={initialAiState}
        scenes={detail.scenes}
      />

      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Target Role</h2>
            <p className="mt-1 text-sm text-muted">
              Progress rolls up against the selected role name across prepared scenes.
            </p>
            <select
              value={detail.targetRole?.audition_role_id ?? ''}
              onChange={(event) => selectTargetRole(event.target.value)}
              className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
            >
              <option value="">Select target role</option>
              {targetRoleOptions.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          {canManage && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Admin Controls</h2>
              <div className="mt-4 space-y-3">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                />
                <input
                  value={sourceLabel}
                  onChange={(event) => setSourceLabel(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                />
                <select
                  value={assignedUserId}
                  onChange={(event) => setAssignedUserId(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                >
                  {uploadUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.display_name}</option>
                  ))}
                </select>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as typeof status)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                >
                  {['uploaded', 'processing', 'ready', 'archived'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <button
                  onClick={saveMeta}
                  disabled={saving}
                  className="rounded-xl border border-gold/40 px-4 py-3 text-sm font-medium text-gold hover:bg-gold/10 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save metadata'}
                </button>
                <p className="text-xs text-muted">
                  Use `processing` during scene prep and switch to `ready` when the assigned rehearser can start work and room hosting.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Scenes</h2>
                <p className="mt-1 text-sm text-muted">
                  Prepared scenes for private rehearsal and room hosting.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {detail.scenes.map((scene, index) => (
                <div key={scene.id} className="rounded-2xl border border-border bg-background/40 p-4">
                  {(() => {
                    const readiness = summarizeSceneReadiness(scene, scene.roles.map((role) => role.name));
                    return (
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gold/80">Scene {index + 1}</div>
                      <h3 className="mt-1 text-lg font-medium">{scene.label}</h3>
                      <p className="mt-1 text-sm text-muted">{scene.source_page_ref || 'No page ref set'}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {scene.roles.map((role) => (
                          <span key={role.id} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                            {role.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-border px-3 py-2 text-center">
                        <div className="text-xs uppercase tracking-wide text-muted">Readiness</div>
                        <div className="mt-1 text-sm font-semibold">
                          {readiness.level.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border px-3 py-2 text-center">
                        <div className="text-xs uppercase tracking-wide text-muted">Progress</div>
                        <div className="mt-1 text-sm font-semibold">
                          {progressByScene.get(scene.id) ?? 0}/{STEP_ORDER.length}
                        </div>
                      </div>
                      <Link
                        href={`/pro/auditions/${detail.script.id}/scenes/${scene.id}`}
                        className="rounded-xl border border-gold/30 px-4 py-2 text-sm text-gold hover:bg-gold/10"
                      >
                        Open Scene
                      </Link>
                      {canHostRoom && (
                        <button
                          onClick={() => launchRoom(scene.id)}
                          disabled={roomLoading || detail.script.status !== 'ready'}
                          className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
                        >
                          Host This Scene
                        </button>
                      )}
                    </div>
                  </div>
                    );
                  })()}

                  {canManage && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => {
                          if (index === 0) return;
                          const ordered = [...detail.scenes];
                          [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
                          void reorderScenes(ordered.map((item) => item.id));
                        }}
                        className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-foreground disabled:opacity-40"
                        disabled={index === 0}
                      >
                        Move up
                      </button>
                      <button
                        onClick={() => {
                          if (index === detail.scenes.length - 1) return;
                          const ordered = [...detail.scenes];
                          [ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]];
                          void reorderScenes(ordered.map((item) => item.id));
                        }}
                        className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-foreground disabled:opacity-40"
                        disabled={index === detail.scenes.length - 1}
                      >
                        Move down
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {detail.scenes.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                  No scenes prepared yet.
                </p>
              )}
            </div>
          </div>

          {canManage && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Add Scene</h2>
              <form onSubmit={addScene} className="mt-4 space-y-3">
                <input
                  value={newScene.label}
                  onChange={(event) => setNewScene((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Scene label"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  required
                />
                <input
                  value={newScene.source_page_ref}
                  onChange={(event) => setNewScene((prev) => ({ ...prev, source_page_ref: event.target.value }))}
                  placeholder="Source page ref"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                />
                <textarea
                  value={newScene.scene_text}
                  onChange={(event) => setNewScene((prev) => ({ ...prev, scene_text: event.target.value }))}
                  placeholder="Prepared scene text"
                  rows={8}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                  required
                />
                <input
                  value={newScene.rolesCsv}
                  onChange={(event) => setNewScene((prev) => ({ ...prev, rolesCsv: event.target.value }))}
                  placeholder="Roles, comma separated"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-gold/50"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Add scene'}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

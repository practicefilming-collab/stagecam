'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  summarizeSceneReadiness,
  type AuditionDraftAssignment,
} from '@/lib/auditions/scene-runtime';
import type {
  AuditionRole,
  AuditionRoomParticipant,
  AuditionRoomSession,
  AuditionScene,
  AuditionScript,
  AuditionTake,
  AuditionTakeRoleAssignment,
  AuditionTargetRole,
} from '@/lib/types';

interface RoomBundle {
  room: AuditionRoomSession;
  script: AuditionScript;
  scenes: Array<AuditionScene & { audition_roles?: AuditionRole[] }>;
  targetRole: AuditionTargetRole | null;
  participants: Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>;
  activeTake: AuditionTake | null;
  activeTakeAssignments: AuditionTakeRoleAssignment[];
  viewer_user_id: string;
  viewer_role: string;
  relationship_label: string | null;
  can_control_room: boolean;
}

function assignmentLabel(assignment: AuditionDraftAssignment, participants: RoomBundle['participants']) {
  if (assignment.assignment_type === 'fallback_audio') return 'Fallback cue';
  const participant = participants.find((item) => item.user_id === assignment.user_id);
  return participant?.profiles?.display_name ?? 'Unassigned';
}

export function AuditionRoomView({
  roomCode,
  initialBundle,
}: {
  roomCode: string;
  initialBundle: RoomBundle;
}) {
  const [bundle, setBundle] = useState(initialBundle);
  const [draftAssignments, setDraftAssignments] = useState<AuditionDraftAssignment[]>(
    (initialBundle.room.draft_assignments as AuditionDraftAssignment[] | null) ?? [],
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [savingCast, setSavingCast] = useState(false);
  const [startingTake, setStartingTake] = useState(false);

  const activeScene = useMemo(
    () => bundle.scenes.find((scene) => scene.id === bundle.room.active_scene_id) ?? bundle.scenes[0] ?? null,
    [bundle.room.active_scene_id, bundle.scenes],
  );

  const sceneRoles = useMemo(
    () => ((activeScene?.audition_roles ?? []) as AuditionRole[]).map((role) => role.name),
    [activeScene],
  );

  const readiness = useMemo(
    () => activeScene
      ? summarizeSceneReadiness(activeScene, sceneRoles)
      : null,
    [activeScene, sceneRoles],
  );

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/audition-rooms/${roomCode}`);
      if (!res.ok) return;
      const payload = await res.json();
      setBundle(payload);
      setDraftAssignments((payload.room.draft_assignments as AuditionDraftAssignment[] | null) ?? []);
    };

    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [roomCode]);

  useEffect(() => {
    if (!activeScene) return;
    setDraftAssignments((current) => {
      const roleMap = new Map(current.map((assignment) => [assignment.role_name, assignment]));
      return sceneRoles.map((roleName) => roleMap.get(roleName) ?? {
        role_name: roleName,
        user_id: null,
        assignment_type: 'fallback_audio' as const,
      });
    });
  }, [activeScene, sceneRoles]);

  const updateRoom = async (updates: Record<string, unknown>) => {
    setError('');
    const res = await fetch(`/api/audition-rooms/${roomCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || 'Could not update room');
      return false;
    }

    setBundle((prev) => ({
      ...prev,
      room: payload,
    }));
    return true;
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveCastPlan = async (nextAssignments: AuditionDraftAssignment[]) => {
    setSavingCast(true);
    setDraftAssignments(nextAssignments);
    const ok = await updateRoom({ draft_assignments: nextAssignments });
    if (!ok) {
      setSavingCast(false);
      return;
    }
    setSavingCast(false);
  };

  const claimRole = async (roleName: string, assignmentType: AuditionDraftAssignment['assignment_type']) => {
    const nextAssignments: AuditionDraftAssignment[] = draftAssignments.map((assignment) => {
      if (assignment.role_name !== roleName) return assignment;
      if (assignmentType === 'fallback_audio') {
        return { ...assignment, assignment_type: 'fallback_audio' as const, user_id: null };
      }
      const currentlyMine = assignment.user_id === bundle.viewer_user_id;
      return {
        ...assignment,
        assignment_type: 'human' as const,
        user_id: currentlyMine ? null : null,
      };
    });
    await saveCastPlan(nextAssignments);
  };

  const assignRoleToViewer = async (roleName: string) => {
    const nextAssignments: AuditionDraftAssignment[] = draftAssignments.map((assignment) =>
      assignment.role_name === roleName
        ? {
            ...assignment,
            assignment_type: 'human' as const,
            user_id: assignment.user_id === bundle.viewer_user_id ? null : bundle.viewer_user_id,
          }
        : assignment,
    );
    await saveCastPlan(nextAssignments);
  };

  const startTake = async () => {
    setStartingTake(true);
    setError('');
    const res = await fetch(`/api/audition-rooms/${roomCode}/takes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: draftAssignments }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || 'Could not start take');
      setStartingTake(false);
      return;
    }
    setStartingTake(false);
    window.location.href = `/rooms/auditions/${roomCode}/takes/${payload.take.id}`;
  };

  const myAssignments = bundle.activeTakeAssignments.filter(
    (assignment) => assignment.user_id === bundle.viewer_user_id,
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Audition room</p>
          <h1 className="mt-2 text-3xl font-bold text-gold">{bundle.script.title}</h1>
          <p className="mt-2 text-sm text-muted">
            Room code {bundle.room.room_code} • {bundle.viewer_role.replace(/_/g, ' ')} • {bundle.room.status}
          </p>
          {bundle.relationship_label && (
            <p className="mt-2 text-xs uppercase tracking-wide text-muted">
              Relation: {bundle.relationship_label}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={copyInvite}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
          >
            {copied ? 'Invite link copied' : 'Copy invite link'}
          </button>
          {bundle.can_control_room && (
            <>
              <button
                onClick={() => updateRoom({ status: 'active' })}
                className="rounded-xl border border-gold/30 px-4 py-3 text-sm text-gold hover:bg-gold/10"
              >
                Mark Active
              </button>
              <button
                onClick={() => updateRoom({ status: 'ended' })}
                className="rounded-xl border border-red-500/30 px-4 py-3 text-sm text-red-300 hover:bg-red-500/10"
              >
                End Room
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Live Scene</h2>
            <div className="mt-4 space-y-3">
              {bundle.scenes.map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => bundle.can_control_room && updateRoom({ active_scene_id: scene.id, clear_active_take: true })}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    scene.id === activeScene?.id
                      ? 'border-gold/40 bg-gold/10'
                      : 'border-border bg-background/40 hover:border-gold/20'
                  }`}
                >
                  <div className="text-sm font-medium">{scene.label}</div>
                  <div className="mt-1 text-xs text-muted">{scene.source_page_ref || 'No page ref'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Participants</h2>
            <div className="mt-4 space-y-3">
              {bundle.participants.map((participant) => (
                <div key={participant.id} className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
                  <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted">
                    {participant.role_type.replace(/_/g, ' ')}
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {participant.left_at
                      ? `Left ${new Date(participant.left_at).toLocaleString()}`
                      : `Joined ${new Date(participant.joined_at).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{activeScene?.label ?? 'No active scene'}</h2>
                <p className="mt-1 text-sm text-muted">
                  Cast the room for this scene, then start a take so each participant can record their assigned lines.
                </p>
              </div>
              {readiness && (
                <div className="rounded-full border border-gold/30 px-4 py-2 text-xs text-gold">
                  {readiness.level.replace(/_/g, ' ')}
                </div>
              )}
            </div>

            {activeScene && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(activeScene.audition_roles ?? []).map((role) => (
                    <span
                      key={role.id}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        role.name === bundle.targetRole?.selected_role_name
                          ? 'border-gold/40 bg-gold/10 text-gold'
                          : 'border-border text-muted'
                      }`}
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
                <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-border bg-background/40 p-5 text-sm leading-7">
                  {activeScene.scene_text}
                </div>
              </>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Cast This Take</h2>
                <p className="mt-1 text-sm text-muted">
                  Assign human performers or leave a role on fallback cue coverage. One participant may hold multiple roles.
                </p>
              </div>
              {savingCast && <div className="text-xs text-muted">Saving cast...</div>}
            </div>

            <div className="mt-4 space-y-3">
              {draftAssignments.map((assignment) => (
                <div key={assignment.role_name} className="rounded-2xl border border-border bg-background/40 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">{assignment.role_name}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
                        {assignmentLabel(assignment, bundle.participants)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => assignRoleToViewer(assignment.role_name)}
                        className="rounded-xl border border-gold/30 px-3 py-2 text-xs text-gold hover:bg-gold/10"
                      >
                        {assignment.user_id ? 'Unclaim' : 'Claim me'}
                      </button>
                      <button
                        onClick={() => claimRole(assignment.role_name, 'fallback_audio')}
                        className="rounded-xl border border-border px-3 py-2 text-xs text-muted hover:text-foreground"
                      >
                        Fallback cue
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={startTake}
              disabled={!readiness?.level1Ready || startingTake || draftAssignments.length === 0}
              className="mt-6 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
            >
              {startingTake ? 'Starting take...' : 'Start new take'}
            </button>
          </div>

          {(bundle.activeTake || bundle.room.active_take_id) && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Active Take</h2>
                  <p className="mt-1 text-sm text-muted">
                    Continue recording your assigned roles or review the take from the scene page.
                  </p>
                </div>
                {bundle.activeTake && (
                  <span className="rounded-full border border-gold/30 px-4 py-2 text-xs text-gold">
                    {bundle.activeTake.status}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(bundle.activeTakeAssignments.length > 0 ? bundle.activeTakeAssignments : myAssignments).map((assignment) => (
                  <span key={assignment.id} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                    {assignment.role_name} • {assignment.assignment_type === 'fallback_audio' ? 'fallback' : 'human'}
                  </span>
                ))}
              </div>

              {bundle.activeTake && (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/rooms/auditions/${roomCode}/takes/${bundle.activeTake.id}`}
                    className="rounded-xl border border-gold/30 px-4 py-3 text-sm text-gold hover:bg-gold/10"
                  >
                    Record my lines
                  </Link>
                  <Link
                    href={`/pro/auditions/${bundle.script.id}/scenes/${bundle.activeTake.audition_scene_id}`}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
                  >
                    Review this scene
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

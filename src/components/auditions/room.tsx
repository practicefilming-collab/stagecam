'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuditionRoomVoicePanel } from '@/components/auditions/room-voice-panel';
import { useAuditionRoomLeave } from '@/hooks/use-audition-room-leave';
import { useAuditionRoomSession } from '@/hooks/use-audition-room-session';
import {
  summarizeSceneReadiness,
  type AuditionDraftAssignment,
} from '@/lib/auditions/scene-runtime';
import type { AuditionParticipantRehearsalProgress } from '@/lib/auditions/rehearsal-progress';
import type {
  AuditionRole,
  AuditionRoomParticipant,
  AuditionRoomSession,
  AuditionRoomVoicePresence,
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
  activeParticipants: Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>;
  departedParticipants: Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>;
  participantProgress: AuditionParticipantRehearsalProgress[];
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

function progressStatusLabel(status: AuditionParticipantRehearsalProgress['status']) {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'awaiting_uploads':
      return 'Awaiting uploads';
    case 'recording':
      return 'Recording';
    case 'fallback_only':
      return 'Fallback only';
    default:
      return 'Idle';
  }
}

function progressSummary(participant: AuditionParticipantRehearsalProgress) {
  if (participant.assignedLineCount === 0) return 'Observer / fallback only';
  if (participant.remainingLineCount > 0) {
    return `${participant.uploadedLineCount}/${participant.assignedLineCount} uploaded • ${participant.remainingLineCount} remaining`;
  }
  return `${participant.uploadedLineCount}/${participant.assignedLineCount} uploaded`;
}

function mergeVoicePresence(
  participants: RoomBundle['activeParticipants'],
  voicePresence: AuditionRoomVoicePresence[],
) {
  const voiceByUser = new Map(voicePresence.map((presence) => [presence.userId, presence]));
  return participants.map((participant) => (
    voiceByUser.get(participant.user_id) ?? {
      userId: participant.user_id,
      displayName: participant.profiles?.display_name ?? null,
      isConnected: false,
      isMuted: false,
      isSpeaking: false,
      audioLevel: 0,
      lastSeenAt: null,
    }
  ));
}

export function AuditionRoomView({
  roomCode,
  initialBundle,
}: {
  roomCode: string;
  initialBundle: RoomBundle;
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initialBundle);
  const [draftAssignments, setDraftAssignments] = useState<AuditionDraftAssignment[]>(
    (initialBundle.room.draft_assignments as AuditionDraftAssignment[] | null) ?? [],
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [savingCast, setSavingCast] = useState(false);
  const [startingTake, setStartingTake] = useState(false);
  const [endingRehearsal, setEndingRehearsal] = useState(false);
  const { leaveRoom, markInternalTransition } = useAuditionRoomLeave(roomCode);

  const loadBundle = useCallback(async () => {
    const res = await fetch(`/api/audition-rooms/${roomCode}`);
    if (!res.ok) return;
    const payload = await res.json();
    setBundle(payload);
    setDraftAssignments((payload.room.draft_assignments as AuditionDraftAssignment[] | null) ?? []);
  }, [roomCode]);

  const viewerDisplayName = useMemo(
    () => bundle.participants.find((participant) => participant.user_id === bundle.viewer_user_id)?.profiles?.display_name ?? null,
    [bundle.participants, bundle.viewer_user_id],
  );
  const {
    broadcastRoomEvent,
    micError,
    micMuted,
    micReady,
    requestMicrophone,
    toggleMute,
    voicePresence,
  } = useAuditionRoomSession({
    roomCode,
    userId: bundle.viewer_user_id,
    displayName: viewerDisplayName,
    autoRequestMic: true,
    onRoomEvent: () => {
      void loadBundle();
    },
  });

  const activeScene = useMemo(
    () => bundle.scenes.find((scene) => scene.id === bundle.room.active_scene_id) ?? bundle.scenes[0] ?? null,
    [bundle.room.active_scene_id, bundle.scenes],
  );
  const activeParticipants = useMemo(
    () => bundle.activeParticipants ?? bundle.participants.filter((participant) => !participant.left_at),
    [bundle.activeParticipants, bundle.participants],
  );
  const departedParticipants = useMemo(
    () => bundle.departedParticipants ?? bundle.participants.filter((participant) => Boolean(participant.left_at)),
    [bundle.departedParticipants, bundle.participants],
  );
  const participantVoicePresence = useMemo(
    () => mergeVoicePresence(activeParticipants, voicePresence),
    [activeParticipants, voicePresence],
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
  const visibleDraftAssignments = useMemo(() => {
    const roleMap = new Map(draftAssignments.map((assignment) => [assignment.role_name, assignment]));
    return sceneRoles.map((roleName) => roleMap.get(roleName) ?? {
      role_name: roleName,
      user_id: null,
      assignment_type: 'fallback_audio' as const,
    });
  }, [draftAssignments, sceneRoles]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBundle();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBundle]);

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
    await broadcastRoomEvent({ type: 'cast_updated' });
    setSavingCast(false);
  };

  const toggleRoleClaim = async (roleName: string) => {
    const nextAssignments: AuditionDraftAssignment[] = visibleDraftAssignments.map((assignment) =>
      assignment.role_name === roleName
        ? {
            ...assignment,
            assignment_type: assignment.user_id === bundle.viewer_user_id ? 'fallback_audio' as const : 'human' as const,
            user_id: assignment.user_id === bundle.viewer_user_id ? null : bundle.viewer_user_id,
          }
        : assignment,
    );
    await saveCastPlan(nextAssignments);
  };

  const setRoleToFallback = async (roleName: string) => {
    const nextAssignments: AuditionDraftAssignment[] = visibleDraftAssignments.map((assignment) =>
      assignment.role_name === roleName
        ? { ...assignment, assignment_type: 'fallback_audio' as const, user_id: null }
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
      body: JSON.stringify({ assignments: visibleDraftAssignments }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || 'Could not start take');
      setStartingTake(false);
      return;
    }
    await broadcastRoomEvent({ type: 'take_started', takeId: payload.take?.id ?? null });
    setStartingTake(false);
    markInternalTransition();
    router.push(`/rooms/auditions/${roomCode}/takes/${payload.take.id}`);
  };

  const myAssignments = bundle.activeTakeAssignments.filter(
    (assignment) => assignment.user_id === bundle.viewer_user_id,
  );
  const hostProgress = bundle.participantProgress.find((item) => item.userId === bundle.room.host_user_id) ?? null;
  const canHighlightEndRehearsal = Boolean(hostProgress?.isComplete);

  const endRehearsal = async () => {
    if (!bundle.activeTake) return;
    setEndingRehearsal(true);
    setError('');
    const res = await fetch(`/api/auditions/takes/${bundle.activeTake.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || 'Could not end rehearsal');
      setEndingRehearsal(false);
      return;
    }
    await updateRoom({ clear_active_take: true });
    await broadcastRoomEvent({ type: 'take_ended', takeId: bundle.activeTake.id });
    setEndingRehearsal(false);
    markInternalTransition();
    router.push(`/pro/auditions/${bundle.script.id}/scenes/${bundle.activeTake.audition_scene_id}/takes/${bundle.activeTake.id}`);
  };

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
          <button
            onClick={async () => {
              await leaveRoom();
              await broadcastRoomEvent({ type: 'participant_left', reason: 'manual_leave' });
              router.push(`/pro/auditions/${bundle.script.id}`);
            }}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
          >
            Leave room
          </button>
          {bundle.can_control_room && (
            <>
              <button
                onClick={async () => {
                  const ok = await updateRoom({ status: 'active' });
                  if (ok) await broadcastRoomEvent({ type: 'room_status', reason: 'marked_active' });
                }}
                className="rounded-xl border border-gold/30 px-4 py-3 text-sm text-gold hover:bg-gold/10"
              >
                Mark Active
              </button>
              <button
                onClick={async () => {
                  const ok = await updateRoom({ status: 'ended' });
                  if (ok) await broadcastRoomEvent({ type: 'room_status', reason: 'ended' });
                }}
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
                  onClick={async () => {
                    if (!bundle.can_control_room) return;
                    const ok = await updateRoom({ active_scene_id: scene.id, clear_active_take: true });
                    if (ok) await broadcastRoomEvent({ type: 'scene_changed' });
                  }}
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

          <AuditionRoomVoicePanel
            voicePresence={participantVoicePresence}
            micReady={micReady}
            micMuted={micMuted}
            micError={micError}
            onRequestMic={() => {
              void requestMicrophone();
            }}
            onToggleMute={() => {
              void toggleMute();
            }}
          />

          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Participants</h2>
            <div className="mt-4 space-y-5">
              <div>
                <div className="text-xs uppercase tracking-wide text-gold/80">In room now</div>
                <div className="mt-3 space-y-3">
                  {activeParticipants.map((participant) => (
                    <div key={participant.id} className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
                      <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
                        {participant.role_type.replace(/_/g, ' ')}
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        Joined {new Date(participant.joined_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {activeParticipants.length === 0 && (
                    <div className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm text-muted">
                      No active participants yet.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Left room</div>
                <div className="mt-3 space-y-3">
                  {departedParticipants.map((participant) => (
                    <div key={participant.id} className="rounded-2xl border border-dashed border-border bg-background/20 px-4 py-3 text-sm opacity-70">
                      <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
                        {participant.role_type.replace(/_/g, ' ')}
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        Left {participant.left_at ? new Date(participant.left_at).toLocaleString() : 'Unknown'}
                      </div>
                    </div>
                  ))}
                  {departedParticipants.length === 0 && (
                    <div className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm text-muted">
                      Nobody has left this room yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{activeScene?.label ?? 'No active scene'}</h2>
                <p className="mt-1 text-sm text-muted">
                  Cast the room for this scene, then start a rehearsal so each participant can record their assigned lines.
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
                <h2 className="text-lg font-semibold">Cast This Rehearsal</h2>
                <p className="mt-1 text-sm text-muted">
                  Assign human performers or leave a role on fallback cue coverage. One participant may hold multiple roles.
                </p>
              </div>
              {savingCast && <div className="text-xs text-muted">Saving cast...</div>}
            </div>

            <div className="mt-4 space-y-3">
              {visibleDraftAssignments.map((assignment) => (
                <div key={assignment.role_name} className="rounded-2xl border border-border bg-background/40 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">{assignment.role_name}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
                        {assignmentLabel(assignment, activeParticipants)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleRoleClaim(assignment.role_name)}
                        disabled={savingCast}
                        className="rounded-xl border border-gold/30 px-3 py-2 text-xs text-gold hover:bg-gold/10"
                      >
                        {assignment.user_id === bundle.viewer_user_id ? 'Unclaim' : 'Claim me'}
                      </button>
                      <button
                        onClick={() => setRoleToFallback(assignment.role_name)}
                        disabled={savingCast}
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
              disabled={!readiness?.level1Ready || startingTake || visibleDraftAssignments.length === 0}
              className="mt-6 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-black hover:bg-gold-dim disabled:opacity-50"
            >
              {startingTake ? 'Starting rehearsal...' : 'Start new rehearsal'}
            </button>
          </div>

          {(bundle.activeTake || bundle.room.active_take_id) && (
            <div className="rounded-3xl border border-border bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Active Rehearsal</h2>
                  <p className="mt-1 text-sm text-muted">
                    Continue recording your assigned roles, track participant upload status, or end the rehearsal once you have what you need.
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
                  <button
                    onClick={() => {
                      markInternalTransition();
                      router.push(`/rooms/auditions/${roomCode}/takes/${bundle.activeTake!.id}`);
                    }}
                    className="rounded-xl border border-gold/30 px-4 py-3 text-sm text-gold hover:bg-gold/10"
                  >
                    Record my lines
                  </button>
                  <button
                    onClick={() => {
                      markInternalTransition();
                      router.push(`/pro/auditions/${bundle.script.id}/scenes/${bundle.activeTake!.audition_scene_id}/takes/${bundle.activeTake!.id}`);
                    }}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
                  >
                    Review this rehearsal
                  </button>
                  {bundle.can_control_room && (
                    <button
                      onClick={endRehearsal}
                      disabled={endingRehearsal}
                      className={`rounded-xl px-4 py-3 text-sm ${
                        canHighlightEndRehearsal
                          ? 'bg-gold font-semibold text-black hover:bg-gold-dim'
                          : 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                      } disabled:opacity-50`}
                    >
                      {endingRehearsal ? 'Ending rehearsal...' : 'End rehearsal'}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {bundle.participantProgress.map((participant) => (
                  <div key={participant.userId} className="rounded-2xl border border-border bg-background/40 px-4 py-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium">
                          {participant.displayName ?? participant.userId}
                          {participant.userId === bundle.room.host_user_id ? ' (host)' : ''}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-wide text-muted">
                          {progressStatusLabel(participant.status)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <div>{progressSummary(participant)}</div>
                      </div>
                    </div>
                    {participant.assignedRoleNames.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {participant.assignedRoleNames.map((roleName) => (
                          <span key={`${participant.userId}:${roleName}`} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted">
                            {roleName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

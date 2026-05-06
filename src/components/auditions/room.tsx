'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  AuditionRole,
  AuditionRoomParticipant,
  AuditionRoomSession,
  AuditionScene,
  AuditionScript,
  AuditionTargetRole,
} from '@/lib/types';

interface RoomBundle {
  room: AuditionRoomSession;
  script: AuditionScript;
  scenes: Array<AuditionScene & { audition_roles?: AuditionRole[] }>;
  targetRole: AuditionTargetRole | null;
  participants: Array<AuditionRoomParticipant & { profiles?: { display_name: string } | null }>;
  viewer_role: string;
  can_control_room: boolean;
}

export function AuditionRoomView({
  roomCode,
  initialBundle,
}: {
  roomCode: string;
  initialBundle: RoomBundle;
}) {
  const [bundle, setBundle] = useState(initialBundle);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const activeScene = useMemo(
    () => bundle.scenes.find((scene) => scene.id === bundle.room.active_scene_id) ?? bundle.scenes[0] ?? null,
    [bundle.room.active_scene_id, bundle.scenes],
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/audition-rooms/${roomCode}`);
      if (!res.ok) return;
      const payload = await res.json();
      setBundle(payload);
    })();

    const interval = setInterval(async () => {
      const res = await fetch(`/api/audition-rooms/${roomCode}`);
      if (!res.ok) return;
      const payload = await res.json();
      setBundle(payload);
    }, 5000);

    return () => clearInterval(interval);
  }, [roomCode]);

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
      return;
    }

    setBundle((prev) => ({
      ...prev,
      room: payload,
    }));
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                  onClick={() => bundle.can_control_room && updateRoom({ active_scene_id: scene.id })}
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
                  Only the active scene is shown in the room. Guests do not receive library access outside this session.
                </p>
              </div>
              {bundle.targetRole && (
                <div className="rounded-full border border-gold/30 px-4 py-2 text-xs text-gold">
                  Target role: {bundle.targetRole.selected_role_name}
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
        </div>
      </section>
    </div>
  );
}

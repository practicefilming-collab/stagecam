'use client';

import type { AuditionRoomVoicePresence } from '@/lib/types';

function SpeakingDot({ presence }: { presence: AuditionRoomVoicePresence }) {
  const scale = 1 + Math.min(1, presence.audioLevel) * 0.9;
  return (
    <span className="relative inline-flex h-3 w-3 items-center justify-center">
      <span
        className={`absolute inset-0 rounded-full bg-gold/30 transition-transform ${presence.isSpeaking ? 'animate-pulse' : ''}`}
        style={{ transform: `scale(${scale})` }}
      />
      <span
        className={`relative h-2.5 w-2.5 rounded-full ${
          presence.isMuted
            ? 'bg-red-400'
            : presence.isConnected
              ? 'bg-emerald-400'
              : 'bg-border'
        }`}
      />
    </span>
  );
}

export function AuditionRoomVoicePanel({
  voicePresence,
  micReady,
  micMuted,
  micError,
  onRequestMic,
  onToggleMute,
}: {
  voicePresence: AuditionRoomVoicePresence[];
  micReady: boolean;
  micMuted: boolean;
  micError: string | null;
  onRequestMic: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Room voice</h2>
          <p className="mt-1 text-sm text-muted">
            Mic stays available across this rehearsal flow so the room can coordinate without dropping out to another call.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!micReady ? (
            <button
              onClick={onRequestMic}
              className="rounded-xl border border-gold/30 px-4 py-2 text-sm text-gold hover:bg-gold/10"
            >
              Enable mic
            </button>
          ) : (
            <button
              onClick={onToggleMute}
              className="rounded-xl border border-gold/30 px-4 py-2 text-sm text-gold hover:bg-gold/10"
            >
              {micMuted ? 'Unmute mic' : 'Mute mic'}
            </button>
          )}
        </div>
      </div>

      {micError && <p className="mt-3 text-xs text-red-400">{micError}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {voicePresence.map((presence) => (
          <div key={presence.userId} className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <SpeakingDot presence={presence} />
                <div className="font-medium">{presence.displayName ?? presence.userId}</div>
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted">
                {presence.isMuted
                  ? 'Muted'
                  : presence.isSpeaking
                    ? 'Speaking'
                    : presence.isConnected
                      ? 'Listening'
                      : 'Offline'}
              </div>
            </div>
          </div>
        ))}
        {voicePresence.length === 0 && (
          <div className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm text-muted">
            Waiting for others to join the room voice session.
          </div>
        )}
      </div>
    </div>
  );
}

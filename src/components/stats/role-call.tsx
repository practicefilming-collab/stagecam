'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMontageOverlay } from '@/components/rehearsal/montage-overlay-provider';

interface ActProgress {
  actNumber: number;
  recorded: number;
  total: number;
}

interface CharacterCard {
  character: string;
  scriptId?: string;
  scriptTitle: string;
  scriptYear: number | null;
  scriptSlug: string;
  acts: ActProgress[];
  totalRecorded: number;
  totalLines: number;
  completionPct: number;
}

interface UnrecordedScene {
  sceneId: string;
  sceneNumber: number;
  sceneHeading: string | null;
  actNumber: number;
  totalLines: number;
  recordedLines: number;
  remainingLines: number;
}

export default function RoleCall({
  characters,
  grouped,
  allowContinue = true,
}: {
  characters: CharacterCard[];
  grouped?: boolean;
  allowContinue?: boolean;
}) {
  const router = useRouter();
  const { showMontage, dismissMontage } = useMontageOverlay();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [unrecordedScenes, setUnrecordedScenes] = useState<UnrecordedScene[]>([]);
  const [loadingUnrecorded, setLoadingUnrecorded] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  if (characters.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted text-sm">No roles recorded yet.</p>
        <p className="text-muted text-xs mt-1">Join a room and perform a character to see your progress here.</p>
      </div>
    );
  }

  const toggleExpand = async (char: CharacterCard) => {
    const key = `${char.character}::${char.scriptId}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey(key);
    setLoadingUnrecorded(true);
    setUnrecordedScenes([]);

    try {
      const res = await fetch(
        `/api/stats/me/unrecorded?scriptId=${char.scriptId}&character=${encodeURIComponent(char.character)}`
      );
      if (res.ok) {
        const data = await res.json();
        setUnrecordedScenes(data.scenes);
      }
    } finally {
      setLoadingUnrecorded(false);
    }
  };

  const handleContinue = async (char: CharacterCard, scene: UnrecordedScene) => {
    const sceneKey = `${scene.sceneId}`;
    showMontage(char.scriptTitle);
    setCreatingRoom(sceneKey);
    setRoomError(null);

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_id: char.scriptId,
          selection_mode: 'pick',
          selected_scene_id: scene.sceneId,
        }),
      });

      if (!res.ok) {
        setRoomError(sceneKey);
        dismissMontage();
        return;
      }

      const room = await res.json();
      router.push(
        `/stage/${room.room_code}?character=${encodeURIComponent(char.character)}&autoStart=1`
      );
    } catch {
      dismissMontage();
    } finally {
      setCreatingRoom(null);
    }
  };

  return (
    <div className="space-y-4">
      {characters.map((char) => {
        const isComplete = char.completionPct === 100;
        const key = `${char.character}::${char.scriptId}`;
        const isExpanded = expandedKey === key;

        return (
          <div
            key={`${char.character}-${char.scriptSlug}`}
            className={`bg-surface border rounded-2xl p-5 transition-colors ${
              isComplete ? 'border-gold' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className={`font-semibold ${isComplete ? 'text-gold' : 'text-foreground'}`}>
                  {char.character}
                </h3>
                {!grouped && (
                  <p className="text-xs text-muted mt-0.5">
                    {char.scriptTitle}{char.scriptYear ? ` (${char.scriptYear})` : ''}
                  </p>
                )}
                <p className="text-xs text-muted/60">{char.totalLines} line{char.totalLines !== 1 ? 's' : ''}</p>
              </div>
              <span className={`text-sm font-mono ${isComplete ? 'text-gold' : 'text-muted'}`}>
                {char.completionPct === 0 && char.totalRecorded > 0 ? '< 1%' : `${char.completionPct}%`}
              </span>
            </div>

            {/* Overall progress bar */}
            <div className="h-2 bg-border rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${isComplete ? 'bg-gold' : 'bg-gold/70'}`}
                style={{ width: `${char.completionPct}%` }}
              />
            </div>

            {/* Per-act breakdown */}
            <div className="space-y-1.5">
              {char.acts.map((act) => {
                const actComplete = act.total > 0 && act.recorded >= act.total;
                return (
                  <div key={act.actNumber} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-10 flex-shrink-0">Act {act.actNumber}</span>
                    <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${actComplete ? 'bg-gold' : 'bg-gold/50'}`}
                        style={{ width: act.total > 0 ? `${(act.recorded / act.total) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className={`text-xs font-mono w-16 text-right ${actComplete ? 'text-gold' : 'text-muted'}`}>
                      {act.recorded}/{act.total}
                    </span>
                  </div>
                );
              })}
            </div>

            {allowContinue && !isComplete && (
              <>
                <button
                  onClick={() => toggleExpand(char)}
                  className="text-xs text-gold/70 hover:text-gold mt-3 inline-flex items-center gap-1"
                >
                  Continue recording
                  <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>→</span>
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {loadingUnrecorded ? (
                      <p className="text-xs text-muted animate-pulse">Loading scenes...</p>
                    ) : unrecordedScenes.length === 0 ? (
                      <p className="text-xs text-gold">All scenes recorded!</p>
                    ) : (
                      unrecordedScenes.map((scene) => (
                        <button
                          key={scene.sceneId}
                          onClick={() => handleContinue(char, scene)}
                          disabled={creatingRoom === scene.sceneId}
                          className="w-full text-left p-3 rounded-lg bg-background/50 border border-transparent hover:border-gold/30 transition-colors disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs text-muted mr-2">
                                Act {scene.actNumber}, Scene {scene.sceneNumber}
                              </span>
                              <span className="text-sm text-foreground">
                                {scene.sceneHeading || 'Untitled'}
                              </span>
                            </div>
                            <span className={`text-xs ml-2 flex-shrink-0 ${roomError === scene.sceneId ? 'text-red-400' : 'text-gold/70'}`}>
                              {creatingRoom === scene.sceneId
                                ? 'Creating...'
                                : roomError === scene.sceneId
                                  ? 'Failed — tap to retry'
                                  : `${scene.remainingLines} remaining`}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

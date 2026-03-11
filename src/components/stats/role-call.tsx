'use client';

import Link from 'next/link';

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

export default function RoleCall({ characters, grouped }: { characters: CharacterCard[]; grouped?: boolean }) {
  if (characters.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted text-sm">No roles recorded yet.</p>
        <p className="text-muted text-xs mt-1">Join a room and perform a character to see your progress here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {characters.map((char) => {
        const isComplete = char.completionPct === 100;
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

            {!isComplete && (
              <Link href={`/stats/${char.scriptSlug}`} className="text-xs text-gold/70 hover:text-gold mt-3 inline-block">
                Continue recording →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

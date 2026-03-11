'use client';

import { useState } from 'react';

interface CharacterRosterProps {
  characters: { name: string; dialogueLines: number }[];
  totalDialogueLines: number;
}

const INITIAL_SHOW = 10;

export default function CharacterRoster({ characters, totalDialogueLines }: CharacterRosterProps) {
  void totalDialogueLines;
  const [expanded, setExpanded] = useState(false);

  if (characters.length === 0) return null;

  const visible = expanded ? characters : characters.slice(0, INITIAL_SHOW);
  const maxCount = characters[0]?.dialogueLines ?? 1;

  return (
    <div>
      <div className="space-y-1">
        {visible.map((char) => (
          <div key={char.name} className="relative flex items-center justify-between py-1.5 px-2 rounded">
            {/* Proportional bar behind text */}
            <div
              className="absolute inset-y-0 left-0 bg-gold/10 rounded"
              style={{ width: `${(char.dialogueLines / maxCount) * 100}%` }}
            />
            <span className="relative text-sm font-medium truncate mr-2">{char.name}</span>
            <span className="relative text-xs text-muted font-mono flex-shrink-0">
              {char.dialogueLines}
            </span>
          </div>
        ))}
      </div>

      {characters.length > INITIAL_SHOW && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gold hover:text-gold-dim mt-2 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${characters.length} characters`}
        </button>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { ClipSegment } from '@/lib/types';

interface SegmentEditorProps {
  clipId: string;
  segment: ClipSegment;
  onSaved: () => void;
  onDeleted: () => void;
  onExpandSubtitles: () => void;
  subtitlesExpanded: boolean;
}

const SEGMENT_TYPES = [
  'full_clip', 'intro', 'main_hook', 'punchline',
  'verse', 'chorus', 'outro', 'custom',
];

export default function SegmentEditor({
  clipId,
  segment,
  onSaved,
  onDeleted,
  onExpandSubtitles,
  subtitlesExpanded,
}: SegmentEditorProps) {
  const [label, setLabel] = useState(segment.display_label);
  const [segType, setSegType] = useState<string>(segment.segment_type);
  const [startMs, setStartMs] = useState(segment.start_ms);
  const [endMs, setEndMs] = useState(segment.end_ms);
  const [difficulty, setDifficulty] = useState<number | ''>(segment.difficulty_rating ?? '');
  const [isActive, setIsActive] = useState(segment.is_active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty =
    label !== segment.display_label ||
    segType !== segment.segment_type ||
    startMs !== segment.start_ms ||
    endMs !== segment.end_ms ||
    (difficulty || null) !== (segment.difficulty_rating || null) ||
    isActive !== segment.is_active;

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/clips/${clipId}/segments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: segment.id,
        display_label: label.trim(),
        segment_type: segType,
        start_ms: startMs,
        end_ms: endMs,
        difficulty_rating: difficulty || null,
        is_active: isActive,
      }),
    });
    setSaving(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete segment "${segment.display_label}"?`)) return;
    setDeleting(true);
    await fetch(`/api/clips/${clipId}/segments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: segment.id }),
    });
    setDeleting(false);
    onDeleted();
  };

  const inputClass = 'bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gold/50';
  const selectClass = 'bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gold/50';

  return (
    <div className={`bg-surface border rounded-xl p-4 ${!isActive ? 'border-red-500/30 opacity-60' : segment.subtitle_verified ? 'border-green-500/30' : 'border-border'}`}>
      {/* Row 1: Label + Type */}
      <div className="flex gap-3 mb-3">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={`${inputClass} flex-1`}
          placeholder="Segment label"
        />
        <select value={segType} onChange={(e) => setSegType(e.target.value)} className={selectClass}>
          {SEGMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Row 2: Timing + Difficulty */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">Start</span>
          <input
            type="number"
            value={startMs}
            onChange={(e) => setStartMs(parseInt(e.target.value) || 0)}
            className={`${inputClass} w-24`}
            step={100}
          />
          <span className="text-xs text-muted">ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">End</span>
          <input
            type="number"
            value={endMs}
            onChange={(e) => setEndMs(parseInt(e.target.value) || 0)}
            className={`${inputClass} w-24`}
            step={100}
          />
          <span className="text-xs text-muted">ms</span>
        </div>
        <span className="text-xs text-muted">({((endMs - startMs) / 1000).toFixed(1)}s)</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted">Diff</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value ? parseInt(e.target.value) : '')}
            className={`${selectClass} w-16`}
          >
            <option value="">-</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Status badges + actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsActive(!isActive)}
          className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
            isActive
              ? 'border-green-500/30 text-green-400 bg-green-500/10'
              : 'border-red-500/30 text-red-400 bg-red-500/10'
          }`}
        >
          {isActive ? 'Active' : 'Inactive'}
        </button>

        {segment.subtitle_verified && (
          <span className="px-2 py-1 rounded text-xs font-medium border border-green-500/30 text-green-400 bg-green-500/10">
            Verified
          </span>
        )}

        {segment.subtitle_source_type && (
          <span className="px-2 py-1 rounded text-xs text-muted border border-border">
            {segment.subtitle_source_type.replace(/_/g, ' ')}
          </span>
        )}

        <span className="text-xs text-muted">
          {segment.subtitle_data?.cues?.length ?? 0} cues
        </span>

        <div className="ml-auto flex gap-2">
          <button
            onClick={onExpandSubtitles}
            className="px-3 py-1.5 rounded text-xs font-medium border border-border text-muted hover:text-foreground hover:border-gold/30 transition-colors"
          >
            {subtitlesExpanded ? 'Hide Subtitles' : 'Edit Subtitles'}
          </button>

          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 bg-gold text-black rounded text-xs font-medium hover:bg-gold-dim transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {deleting ? '...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

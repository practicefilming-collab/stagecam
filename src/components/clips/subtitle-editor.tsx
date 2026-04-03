'use client';

import { useState } from 'react';
import type { ClipSegment, ClipSubtitleData, ClipSubtitleCue } from '@/lib/types';

interface SubtitleEditorProps {
  clipId: string;
  segment: ClipSegment;
  onSaved: () => void;
}

export default function SubtitleEditor({ clipId, segment, onSaved }: SubtitleEditorProps) {
  const initial: ClipSubtitleData = segment.subtitle_data ?? { cues: [] };
  const [cues, setCues] = useState<ClipSubtitleCue[]>(initial.cues);
  const [expandedCue, setExpandedCue] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const updateCue = (index: number, updates: Partial<ClipSubtitleCue>) => {
    setCues((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const updateWord = (cueIndex: number, wordIndex: number, updates: { word?: string; start_ms?: number; end_ms?: number }) => {
    setCues((prev) =>
      prev.map((c, ci) =>
        ci === cueIndex
          ? {
              ...c,
              words: c.words.map((w, wi) => (wi === wordIndex ? { ...w, ...updates } : w)),
            }
          : c,
      ),
    );
  };

  const addCue = () => {
    const lastCue = cues[cues.length - 1];
    const startMs = lastCue ? lastCue.end_ms + 100 : segment.start_ms;
    setCues([
      ...cues,
      {
        cue_id: cues.length + 1,
        start_ms: startMs,
        end_ms: startMs + 2000,
        text: '',
        words: [],
      },
    ]);
  };

  const deleteCue = (index: number) => {
    setCues((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, cue_id: i + 1 })));
  };

  const handleSave = async () => {
    setSaving(true);
    const subtitleData: ClipSubtitleData = { cues };
    await fetch(`/api/clips/${clipId}/segments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: segment.id,
        subtitle_data: subtitleData,
        subtitle_source_type: segment.subtitle_source_type === 'tiktok_caption' || segment.subtitle_source_type === 'speech_to_text'
          ? 'hybrid'
          : segment.subtitle_source_type ?? 'manual_entry',
      }),
    });
    setSaving(false);
    onSaved();
  };

  const handleVerify = async () => {
    await fetch(`/api/clips/${clipId}/segments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: segment.id,
        subtitle_verified: true,
      }),
    });
    onSaved();
  };

  const handleUnverify = async () => {
    await fetch(`/api/clips/${clipId}/segments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: segment.id,
        subtitle_verified: false,
      }),
    });
    onSaved();
  };

  const inputClass = 'bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-gold/50';

  return (
    <div className="bg-background border border-border rounded-xl p-4 mt-2">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">
          Subtitle Cues ({cues.length})
          {segment.subtitle_source_type && (
            <span className="ml-2 text-xs text-muted font-normal">
              source: {segment.subtitle_source_type.replace(/_/g, ' ')}
            </span>
          )}
        </h4>
        <div className="flex gap-2">
          {segment.subtitle_verified ? (
            <button
              onClick={handleUnverify}
              className="px-3 py-1 rounded text-xs font-medium border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors"
            >
              Verified — Unverify
            </button>
          ) : (
            <button
              onClick={handleVerify}
              className="px-3 py-1 rounded text-xs font-medium border border-border text-muted hover:border-green-500/30 hover:text-green-400 transition-colors"
            >
              Mark as Verified
            </button>
          )}
        </div>
      </div>

      {/* Cue list */}
      <div className="space-y-3">
        {cues.map((cue, i) => (
          <div key={cue.cue_id} className="bg-surface border border-border rounded-lg p-3">
            {/* Cue header: text + timing */}
            <div className="flex gap-2 mb-2">
              <span className="text-xs text-muted font-mono w-6 pt-1.5">{cue.cue_id}</span>
              <textarea
                value={cue.text}
                onChange={(e) => updateCue(i, { text: e.target.value })}
                className={`${inputClass} flex-1 min-h-[36px] resize-y`}
                rows={1}
                placeholder="Cue text..."
              />
            </div>

            <div className="flex items-center gap-3 ml-8">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted">Start</span>
                <input
                  type="number"
                  value={cue.start_ms}
                  onChange={(e) => updateCue(i, { start_ms: parseInt(e.target.value) || 0 })}
                  className={`${inputClass} w-20`}
                  step={50}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted">End</span>
                <input
                  type="number"
                  value={cue.end_ms}
                  onChange={(e) => updateCue(i, { end_ms: parseInt(e.target.value) || 0 })}
                  className={`${inputClass} w-20`}
                  step={50}
                />
              </div>
              <span className="text-xs text-muted">({((cue.end_ms - cue.start_ms) / 1000).toFixed(2)}s)</span>

              <button
                onClick={() => setExpandedCue(expandedCue === i ? null : i)}
                className="text-xs text-muted hover:text-foreground ml-2"
              >
                {cue.words.length} words {expandedCue === i ? '▲' : '▼'}
              </button>

              <button
                onClick={() => deleteCue(i)}
                className="ml-auto text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>

            {/* Expanded word-level timing */}
            {expandedCue === i && cue.words.length > 0 && (
              <div className="mt-3 ml-8 bg-background rounded-lg p-2 space-y-1">
                {cue.words.map((w, wi) => (
                  <div key={wi} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={w.word}
                      onChange={(e) => updateWord(i, wi, { word: e.target.value })}
                      className={`${inputClass} w-28`}
                    />
                    <input
                      type="number"
                      value={w.start_ms}
                      onChange={(e) => updateWord(i, wi, { start_ms: parseInt(e.target.value) || 0 })}
                      className={`${inputClass} w-20`}
                      step={10}
                    />
                    <span className="text-xs text-muted">-</span>
                    <input
                      type="number"
                      value={w.end_ms}
                      onChange={(e) => updateWord(i, wi, { end_ms: parseInt(e.target.value) || 0 })}
                      className={`${inputClass} w-20`}
                      step={10}
                    />
                    <span className="text-xs text-muted">ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={addCue}
          className="px-3 py-1.5 rounded text-xs font-medium border border-border text-muted hover:text-foreground hover:border-gold/30 transition-colors"
        >
          + Add Cue
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-gold text-black rounded text-xs font-medium hover:bg-gold-dim transition-colors disabled:opacity-50 ml-auto"
        >
          {saving ? 'Saving...' : 'Save Subtitles'}
        </button>
      </div>
    </div>
  );
}

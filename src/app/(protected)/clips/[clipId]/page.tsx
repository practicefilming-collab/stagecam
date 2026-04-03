'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Clip, ClipSegment, ClipVisualizationConfig, ClipCreator, ClipSound, ClipCollection } from '@/lib/types';
import SegmentEditor from '@/components/clips/segment-editor';
import SubtitleEditor from '@/components/clips/subtitle-editor';
import VizConfigEditor from '@/components/clips/visualization/viz-config-editor';

interface ClipDetail {
  clip: Clip & {
    clip_creators: ClipCreator | null;
    clip_sounds: ClipSound | null;
    clip_collections: ClipCollection | null;
  };
  segments: ClipSegment[];
  vizConfig: ClipVisualizationConfig | null;
}

export default function ClipDetailPage() {
  const { clipId } = useParams<{ clipId: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ClipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [expandedSubtitles, setExpandedSubtitles] = useState<string | null>(null);
  const [showCreateSegment, setShowCreateSegment] = useState(false);
  const [newSegLabel, setNewSegLabel] = useState('');
  const [newSegStartMs, setNewSegStartMs] = useState(0);
  const [newSegEndMs, setNewSegEndMs] = useState(0);
  const [newSegType, setNewSegType] = useState('custom');
  const [creating, setCreating] = useState(false);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/clips/${clipId}`);
    if (res.status === 403) {
      router.replace('/menu');
      return;
    }
    if (res.status === 404) {
      router.replace('/clips');
      return;
    }
    const data = await res.json();
    setDetail(data);
    setLoading(false);
  }, [clipId, router]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const toggleActive = async () => {
    if (!detail) return;
    await fetch(`/api/clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !detail.clip.is_active }),
    });
    loadDetail();
  };

  const triggerPipeline = async (action: 'start' | 'retry') => {
    setPipelineLoading(true);
    await fetch(`/api/clips/${clipId}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setPipelineLoading(false);
    loadDetail();
  };

  const deleteClip = async () => {
    if (!confirm('Permanently delete this clip and all associated data?')) return;
    await fetch(`/api/clips/${clipId}`, { method: 'DELETE' });
    router.push('/clips');
  };

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const { clip, segments, vizConfig } = detail;

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/10 border-green-400/30';
      case 'ready_for_review': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      case 'failed': return 'text-red-400 bg-red-400/10 border-red-400/30';
      default: return 'text-muted bg-muted/10 border-border';
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link href="/clips" className="text-xs text-muted hover:text-foreground mb-2 inline-block">&larr; Back to Clips</Link>
          <h1 className="text-2xl font-bold text-gold">{clip.display_title}</h1>
          <p className="text-xs text-muted mt-1">{clip.source_url}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clips/${clipId}/edit`}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:border-gold/30 transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={toggleActive}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              clip.is_active
                ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                : 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
            }`}
          >
            {clip.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Content Type</p>
          <p className="text-sm font-medium mt-0.5">{clip.content_type.replace(/_/g, ' ')}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Energy</p>
          <p className="text-sm font-medium mt-0.5">{clip.energy_level}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Difficulty</p>
          <p className="text-sm font-medium mt-0.5">{clip.difficulty_rating ?? 'Not set'}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Duration</p>
          <p className="text-sm font-medium mt-0.5">{clip.duration_ms ? `${Math.round(clip.duration_ms / 1000)}s` : 'Unknown'}</p>
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium mb-1">Pipeline Status</h2>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${statusColor(clip.pipeline_status)}`}>
              {clip.pipeline_status.replace(/_/g, ' ')}
            </span>
            {clip.pipeline_error && (
              <p className="text-xs text-red-400 mt-2">{clip.pipeline_error}</p>
            )}
          </div>
          <div className="flex gap-2">
            {(clip.pipeline_status === 'pending') && (
              <button
                onClick={() => triggerPipeline('start')}
                disabled={pipelineLoading}
                className="px-4 py-2 bg-gold text-black rounded-lg text-sm font-medium hover:bg-gold-dim transition-colors disabled:opacity-50"
              >
                {pipelineLoading ? 'Starting...' : 'Start Pipeline'}
              </button>
            )}
            {clip.pipeline_status === 'failed' && (
              <button
                onClick={() => triggerPipeline('retry')}
                disabled={pipelineLoading}
                className="px-4 py-2 bg-gold text-black rounded-lg text-sm font-medium hover:bg-gold-dim transition-colors disabled:opacity-50"
              >
                {pipelineLoading ? 'Retrying...' : 'Retry Pipeline'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Segments */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium">Segments ({segments.length})</h2>
          <button
            onClick={() => setShowCreateSegment(!showCreateSegment)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted hover:text-foreground hover:border-gold/30 transition-colors"
          >
            {showCreateSegment ? 'Cancel' : '+ Add Segment'}
          </button>
        </div>

        {/* Create segment form */}
        {showCreateSegment && (
          <div className="bg-surface border border-gold/30 rounded-xl p-4 mb-4">
            <div className="flex gap-3 mb-3">
              <input
                type="text"
                value={newSegLabel}
                onChange={(e) => setNewSegLabel(e.target.value)}
                placeholder="Segment label"
                className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
              />
              <select
                value={newSegType}
                onChange={(e) => setNewSegType(e.target.value)}
                className="bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
              >
                {['full_clip', 'intro', 'main_hook', 'punchline', 'verse', 'chorus', 'outro', 'custom'].map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted">Start</span>
                <input type="number" value={newSegStartMs} onChange={(e) => setNewSegStartMs(parseInt(e.target.value) || 0)} className="bg-background border border-border rounded px-2 py-1.5 text-sm w-24 focus:outline-none focus:border-gold/50" step={100} />
                <span className="text-xs text-muted">ms</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted">End</span>
                <input type="number" value={newSegEndMs} onChange={(e) => setNewSegEndMs(parseInt(e.target.value) || 0)} className="bg-background border border-border rounded px-2 py-1.5 text-sm w-24 focus:outline-none focus:border-gold/50" step={100} />
                <span className="text-xs text-muted">ms</span>
              </div>
              <button
                onClick={async () => {
                  if (!newSegLabel.trim()) return;
                  setCreating(true);
                  await fetch(`/api/clips/${clipId}/segments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      display_label: newSegLabel.trim(),
                      start_ms: newSegStartMs,
                      end_ms: newSegEndMs,
                      segment_type: newSegType,
                      ordering_index: segments.length,
                    }),
                  });
                  setCreating(false);
                  setNewSegLabel('');
                  setShowCreateSegment(false);
                  loadDetail();
                }}
                disabled={creating || !newSegLabel.trim()}
                className="px-4 py-1.5 bg-gold text-black rounded text-sm font-medium hover:bg-gold-dim transition-colors disabled:opacity-50 ml-auto"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {segments.length === 0 ? (
          <p className="text-xs text-muted bg-surface border border-border rounded-xl p-5">No segments yet. Run the pipeline to auto-generate segments from speech detection.</p>
        ) : (
          <div className="space-y-3">
            {segments.map((seg) => (
              <div key={seg.id}>
                <SegmentEditor
                  clipId={clipId}
                  segment={seg}
                  onSaved={loadDetail}
                  onDeleted={loadDetail}
                  onExpandSubtitles={() => setExpandedSubtitles(expandedSubtitles === seg.id ? null : seg.id)}
                  subtitlesExpanded={expandedSubtitles === seg.id}
                />
                {expandedSubtitles === seg.id && (
                  <SubtitleEditor
                    clipId={clipId}
                    segment={seg}
                    onSaved={loadDetail}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visualization Config */}
      {vizConfig && (
        <div className="mb-6">
          <VizConfigEditor clipId={clipId} config={vizConfig} onSaved={loadDetail} />
        </div>
      )}

      {/* Creator / Sound / Collection */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Creator</p>
          <p className="text-sm font-medium mt-0.5">
            {clip.clip_creators ? clip.clip_creators.display_name : 'None'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Sound</p>
          <p className="text-sm font-medium mt-0.5">
            {clip.clip_sounds ? clip.clip_sounds.display_name : 'None'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs text-muted">Collection</p>
          <p className="text-sm font-medium mt-0.5">
            {clip.clip_collections ? clip.clip_collections.display_name : 'None'}
          </p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="border border-red-500/20 rounded-xl p-5">
        <h2 className="text-red-400 font-medium mb-2">Danger Zone</h2>
        <button
          onClick={deleteClip}
          className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
        >
          Delete Clip
        </button>
      </div>
    </div>
  );
}

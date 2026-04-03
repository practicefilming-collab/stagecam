'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Clip, ClipCollection, ClipCreator } from '@/lib/types';

interface ClipListItem extends Clip {
  clip_creators: { display_name: string; platform_handle: string | null } | null;
  clip_sounds: { display_name: string } | null;
  clip_collections: { display_name: string } | null;
}

export default function ClipsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clips, setClips] = useState<ClipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Filters
  const [contentType, setContentType] = useState<string>(searchParams.get('content_type') ?? 'all');
  const [collectionId, setCollectionId] = useState<string>(searchParams.get('collection_id') ?? 'all');
  const [creatorId, setCreatorId] = useState<string>(searchParams.get('creator_id') ?? 'all');
  const [categoryBucket, setCategoryBucket] = useState<string>(searchParams.get('category_bucket') ?? 'all');

  // Filter options
  const [collections, setCollections] = useState<ClipCollection[]>([]);
  const [creators, setCreators] = useState<ClipCreator[]>([]);

  // Load filter options once
  useEffect(() => {
    fetch('/api/clips/collections').then(r => r.json()).then(d => { if (Array.isArray(d)) setCollections(d); }).catch(() => {});
    fetch('/api/clips/creators').then(r => r.json()).then(d => { if (Array.isArray(d)) setCreators(d); }).catch(() => {});
  }, []);

  const loadClips = useCallback(async () => {
    const params = new URLSearchParams({ include_inactive: 'true' });
    if (contentType !== 'all') params.set('content_type', contentType);
    if (collectionId !== 'all') params.set('collection_id', collectionId);
    if (creatorId !== 'all') params.set('creator_id', creatorId);
    if (categoryBucket !== 'all') params.set('category_bucket', categoryBucket);

    const res = await fetch(`/api/clips?${params}`);
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setClips(data);
    setLoading(false);
  }, [contentType, collectionId, creatorId, categoryBucket]);

  useEffect(() => {
    setLoading(true);
    void loadClips();
  }, [loadClips]);

  useEffect(() => {
    if (forbidden) router.replace('/menu');
  }, [forbidden, router]);

  if (forbidden) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const contentTypes = ['all', 'spoken_word', 'lip_sync', 'music_performance', 'comedy_timing', 'mixed'];
  const categoryBuckets = ['all', 'trending', 'classic', 'creator_spotlight', 'challenge', 'unsorted'];

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'ready_for_review': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      default: return 'text-muted';
    }
  };

  const selectClass = 'bg-surface border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-gold/50';

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gold">Clips</h1>
        <div className="flex gap-2">
          <Link
            href="/clips/collections"
            className="px-4 py-2.5 bg-surface border border-border rounded-lg text-sm hover:border-gold/30 transition-colors"
          >
            Collections
          </Link>
          <Link
            href="/clips/add"
            className="px-5 py-2.5 bg-gold text-black rounded-lg font-medium text-sm hover:bg-gold-dim transition-colors"
          >
            Add Clip
          </Link>
        </div>
      </div>

      {/* Content type filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {contentTypes.map((type) => (
          <button
            key={type}
            onClick={() => setContentType(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              contentType === type
                ? 'bg-gold text-black'
                : 'bg-surface border border-border text-muted hover:text-foreground'
            }`}
          >
            {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Secondary filters: collection, creator, category */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Collections</option>
          {collections.map((col) => (
            <option key={col.id} value={col.id}>{col.display_name}</option>
          ))}
        </select>

        <select
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          className={selectClass}
        >
          <option value="all">All Creators</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>{c.display_name}{c.platform_handle ? ` (${c.platform_handle})` : ''}</option>
          ))}
        </select>

        <div className="flex gap-1.5">
          {categoryBuckets.map((bucket) => (
            <button
              key={bucket}
              onClick={() => setCategoryBucket(bucket)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                categoryBucket === bucket
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-surface border border-border text-muted hover:text-foreground'
              }`}
            >
              {bucket === 'all' ? 'Any' : bucket.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {(contentType !== 'all' || collectionId !== 'all' || creatorId !== 'all' || categoryBucket !== 'all') && (
          <button
            onClick={() => { setContentType('all'); setCollectionId('all'); setCreatorId('all'); setCategoryBucket('all'); }}
            className="text-xs text-muted hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Clips list */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-muted">Loading clips...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clips.map((clip) => (
            <Link
              key={clip.id}
              href={`/clips/${clip.id}`}
              className="block bg-surface border border-border rounded-xl p-5 hover:border-gold/30 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{clip.display_title}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                    <span className="bg-background px-2 py-0.5 rounded">
                      {clip.content_type.replace(/_/g, ' ')}
                    </span>
                    <span className="bg-background px-2 py-0.5 rounded">
                      {clip.source_platform.replace(/_/g, ' ')}
                    </span>
                    {clip.duration_ms && (
                      <span>{Math.round(clip.duration_ms / 1000)}s</span>
                    )}
                    {clip.clip_creators && (
                      <span>by {clip.clip_creators.display_name}</span>
                    )}
                    {clip.clip_collections && (
                      <span>in {clip.clip_collections.display_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className={`text-xs font-medium ${statusColor(clip.pipeline_status)}`}>
                    {clip.pipeline_status.replace(/_/g, ' ')}
                  </span>
                  {clip.is_active && (
                    <span className="w-2 h-2 rounded-full bg-green-400" title="Active" />
                  )}
                </div>
              </div>
            </Link>
          ))}

          {clips.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted mb-4">No clips match these filters.</p>
              <Link href="/clips/add" className="text-gold hover:underline text-sm">
                Add a clip
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

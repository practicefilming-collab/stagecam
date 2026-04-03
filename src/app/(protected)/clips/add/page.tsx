'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClipCreator, ClipSound, ClipCollection } from '@/lib/types';

export default function AddClipPage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [contentType, setContentType] = useState('spoken_word');
  const [energyLevel, setEnergyLevel] = useState('medium');
  const [difficultyRating, setDifficultyRating] = useState<number | ''>('');
  const [categoryBucket, setCategoryBucket] = useState('unsorted');
  const [creatorId, setCreatorId] = useState('');
  const [soundId, setSoundId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load metadata options
  const [creators, setCreators] = useState<ClipCreator[]>([]);
  const [sounds, setSounds] = useState<ClipSound[]>([]);
  const [collections, setCollections] = useState<ClipCollection[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/clips/creators').then(r => r.json()),
      fetch('/api/clips/sounds').then(r => r.json()),
      fetch('/api/clips/collections').then(r => r.json()),
    ]).then(([c, s, col]) => {
      if (Array.isArray(c)) setCreators(c);
      if (Array.isArray(s)) setSounds(s);
      if (Array.isArray(col)) setCollections(col);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sourceUrl.trim() || !displayTitle.trim()) {
      setError('URL and title are required');
      return;
    }

    setSubmitting(true);

    const res = await fetch('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: sourceUrl.trim(),
        display_title: displayTitle.trim(),
        content_type: contentType,
        energy_level: energyLevel,
        difficulty_rating: difficultyRating || null,
        category_bucket: categoryBucket,
        creator_id: creatorId || null,
        sound_id: soundId || null,
        collection_id: collectionId || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to create clip');
      setSubmitting(false);
      return;
    }

    const clip = await res.json();
    router.push(`/clips/${clip.id}`);
  };

  const contentTypes = ['spoken_word', 'lip_sync', 'music_performance', 'comedy_timing', 'mixed'];
  const energyLevels = ['low', 'medium', 'high', 'explosive'];
  const categoryBuckets = ['trending', 'classic', 'creator_spotlight', 'challenge', 'unsorted'];

  const inputClass = 'w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm placeholder:text-muted/40 focus:outline-none focus:border-gold/50';
  const selectClass = 'w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold/50';
  const labelClass = 'block text-xs text-muted mb-1.5';

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gold mb-8">Add Clip</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelClass}>TikTok URL *</label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@user/video/..."
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className={labelClass}>Display Title *</label>
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => setDisplayTitle(e.target.value)}
            placeholder="Short descriptive title for this clip"
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Content Type</label>
            <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={selectClass}>
              {contentTypes.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Energy Level</label>
            <select value={energyLevel} onChange={(e) => setEnergyLevel(e.target.value)} className={selectClass}>
              {energyLevels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Difficulty (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={difficultyRating}
              onChange={(e) => setDifficultyRating(e.target.value ? parseInt(e.target.value) : '')}
              className={inputClass}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className={labelClass}>Category</label>
            <select value={categoryBucket} onChange={(e) => setCategoryBucket(e.target.value)} className={selectClass}>
              {categoryBuckets.map((b) => (
                <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Creator</label>
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}{c.platform_handle ? ` (${c.platform_handle})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Sound</label>
          <select value={soundId} onChange={(e) => setSoundId(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {sounds.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Collection</label>
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>{col.display_name}</option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-gold text-black rounded-lg font-medium text-sm hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Add Clip'}
        </button>
      </form>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ClipCollection } from '@/lib/types';

interface CollectionWithCount extends ClipCollection {
  clip_count?: number;
  editing?: boolean;
}

export default function ClipCollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('custom');
  const [submitting, setSubmitting] = useState(false);

  const loadCollections = useCallback(async () => {
    const res = await fetch('/api/clips/collections');
    if (res.status === 403) { router.replace('/menu'); return; }
    const data = await res.json();
    if (!Array.isArray(data)) { setLoading(false); return; }

    // Fetch clip counts for each collection
    const withCounts = await Promise.all(
      data.map(async (col: ClipCollection) => {
        const countRes = await fetch(`/api/clips/collections/${col.id}`);
        if (countRes.ok) {
          const detail = await countRes.json();
          return { ...col, clip_count: detail.clip_count ?? 0 };
        }
        return { ...col, clip_count: 0 };
      }),
    );

    setCollections(withCounts);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);

    await fetch('/api/clips/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: newName.trim(),
        description: newDescription.trim() || null,
        collection_type: newType,
      }),
    });

    setNewName('');
    setNewDescription('');
    setSubmitting(false);
    loadCollections();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete collection "${name}"? Clips in this collection will remain but lose their collection association.`)) return;
    await fetch(`/api/clips/collections/${id}`, { method: 'DELETE' });
    loadCollections();
  };

  const handleSave = async (col: CollectionWithCount, updates: Partial<ClipCollection>) => {
    await fetch(`/api/clips/collections/${col.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    loadCollections();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const collectionTypes = ['trend', 'creator_set', 'theme', 'difficulty_ladder', 'custom'];

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gold">Collections</h1>
        <Link href="/clips" className="text-xs text-muted hover:text-foreground">&larr; Back to Clips</Link>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-8 bg-surface border border-border rounded-xl p-4">
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name..."
            className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-sm placeholder:text-muted/40 focus:outline-none focus:border-gold/50"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold/50"
          >
            {collectionTypes.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-sm placeholder:text-muted/40 focus:outline-none focus:border-gold/50"
          />
          <button
            type="submit"
            disabled={submitting || !newName.trim()}
            className="px-6 py-2.5 bg-gold text-black rounded-lg font-medium text-sm hover:bg-gold-dim transition-colors disabled:opacity-50"
          >
            {submitting ? '...' : 'Create'}
          </button>
        </div>
      </form>

      {/* Collections list */}
      <div className="space-y-3">
        {collections.map((col) => (
          <CollectionCard
            key={col.id}
            collection={col}
            collectionTypes={collectionTypes}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ))}

        {collections.length === 0 && (
          <p className="text-muted text-center py-8">No collections yet.</p>
        )}
      </div>
    </div>
  );
}

function CollectionCard({
  collection,
  collectionTypes,
  onSave,
  onDelete,
}: {
  collection: CollectionWithCount;
  collectionTypes: string[];
  onSave: (col: CollectionWithCount, updates: Partial<ClipCollection>) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.display_name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [type, setType] = useState<string>(collection.collection_type);

  const handleSave = async () => {
    await onSave(collection, {
      display_name: name.trim(),
      description: description.trim() || null,
      collection_type: type as ClipCollection['collection_type'],
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-surface border border-gold/30 rounded-xl p-5">
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-gold/50"
          />
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-background border border-border rounded px-3 py-2 text-sm">
            {collectionTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:border-gold/50"
        />
        <div className="flex gap-2">
          <button onClick={handleSave} className="px-4 py-1.5 bg-gold text-black rounded text-xs font-medium hover:bg-gold-dim transition-colors">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-4 py-1.5 bg-surface border border-border rounded text-xs text-muted hover:text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <Link href={`/clips?collection_id=${collection.id}`} className="font-medium hover:text-gold transition-colors">
          {collection.display_name}
        </Link>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted">
          <span>{collection.collection_type.replace(/_/g, ' ')}</span>
          <span>{collection.clip_count ?? 0} clips</span>
          {collection.description && <span>{collection.description}</span>}
        </div>
      </div>
      <div className="flex gap-2 ml-4">
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded text-xs border border-border text-muted hover:text-foreground hover:border-gold/30 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(collection.id, collection.display_name)}
          className="px-3 py-1.5 rounded text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

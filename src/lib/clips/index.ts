import type { SupabaseClient } from '@supabase/supabase-js';
import type { Clip, ClipSegment, ClipVisualizationConfig, ClipCreator, ClipSound, ClipCollection } from '@/lib/types';

/** Fetch all active clips with optional filters. */
export async function getClips(
  supabase: SupabaseClient,
  filters?: {
    contentType?: string;
    collectionId?: string;
    creatorId?: string;
    categoryBucket?: string;
    includeInactive?: boolean;
  },
) {
  let query = supabase
    .from('clips')
    .select('*, clip_creators(display_name, platform_handle), clip_sounds(display_name), clip_collections(display_name)')
    .order('created_at', { ascending: false });

  if (!filters?.includeInactive) {
    query = query.eq('is_active', true);
  }
  if (filters?.contentType) {
    query = query.eq('content_type', filters.contentType);
  }
  if (filters?.collectionId) {
    query = query.eq('collection_id', filters.collectionId);
  }
  if (filters?.creatorId) {
    query = query.eq('creator_id', filters.creatorId);
  }
  if (filters?.categoryBucket) {
    query = query.eq('category_bucket', filters.categoryBucket);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as (Clip & {
    clip_creators: { display_name: string; platform_handle: string | null } | null;
    clip_sounds: { display_name: string } | null;
    clip_collections: { display_name: string } | null;
  })[];
}

/** Fetch a single clip by ID with all related data. */
export async function getClipDetail(supabase: SupabaseClient, clipId: string) {
  const { data: clip, error } = await supabase
    .from('clips')
    .select('*, clip_creators(*), clip_sounds(*), clip_collections(*)')
    .eq('id', clipId)
    .single();

  if (error) throw error;

  const { data: segments } = await supabase
    .from('clip_segments')
    .select('*')
    .eq('clip_id', clipId)
    .order('ordering_index');

  const { data: vizConfig } = await supabase
    .from('clip_visualization_configs')
    .select('*')
    .eq('clip_id', clipId)
    .single();

  return {
    clip: clip as Clip & {
      clip_creators: ClipCreator | null;
      clip_sounds: ClipSound | null;
      clip_collections: ClipCollection | null;
    },
    segments: (segments ?? []) as ClipSegment[],
    vizConfig: (vizConfig ?? null) as ClipVisualizationConfig | null,
  };
}

/** Detect the source platform from a URL. */
export function detectPlatform(url: string): Clip['source_platform'] {
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('instagram.com/reel')) return 'instagram_reel';
  if (url.includes('youtube.com/shorts') || url.includes('youtu.be')) return 'youtube_short';
  return 'other';
}

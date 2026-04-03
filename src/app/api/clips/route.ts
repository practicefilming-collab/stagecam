import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { getClips, detectPlatform } from '@/lib/clips';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get('content_type') ?? undefined;
  const collectionId = searchParams.get('collection_id') ?? undefined;
  const creatorId = searchParams.get('creator_id') ?? undefined;
  const categoryBucket = searchParams.get('category_bucket') ?? undefined;
  const includeInactive = searchParams.get('include_inactive') === 'true';

  try {
    const clips = await getClips(supabase, {
      contentType,
      collectionId,
      creatorId,
      categoryBucket,
      includeInactive,
    });
    return NextResponse.json(clips);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { source_url, display_title, content_type } = body;

  if (!source_url?.trim()) {
    return NextResponse.json({ error: 'source_url is required' }, { status: 400 });
  }

  if (!display_title?.trim()) {
    return NextResponse.json({ error: 'display_title is required' }, { status: 400 });
  }

  if (!content_type) {
    return NextResponse.json({ error: 'content_type is required' }, { status: 400 });
  }

  const source_platform = detectPlatform(source_url);

  const { data: clip, error } = await supabase
    .from('clips')
    .insert({
      display_title: display_title.trim(),
      source_url: source_url.trim(),
      source_platform,
      content_type,
      content_language: body.content_language ?? 'en',
      difficulty_rating: body.difficulty_rating ?? null,
      energy_level: body.energy_level ?? 'medium',
      beat_profile: body.beat_profile ?? 'speech_paced',
      tags: body.tags ?? [],
      category_bucket: body.category_bucket ?? 'unsorted',
      creator_id: body.creator_id ?? null,
      sound_id: body.sound_id ?? null,
      collection_id: body.collection_id ?? null,
      duration_ms: body.duration_ms ?? null,
      pipeline_status: 'pending',
      added_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create default visualization config
  await supabase.from('clip_visualization_configs').insert({
    clip_id: clip.id,
  });

  return NextResponse.json(clip);
}

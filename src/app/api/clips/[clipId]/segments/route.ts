import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('clip_segments')
    .select('*')
    .eq('clip_id', clipId)
    .order('ordering_index');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  if (!body.display_label?.trim()) {
    return NextResponse.json({ error: 'display_label is required' }, { status: 400 });
  }

  if (body.start_ms == null || body.end_ms == null) {
    return NextResponse.json({ error: 'start_ms and end_ms are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clip_segments')
    .insert({
      clip_id: clipId,
      display_label: body.display_label.trim(),
      start_ms: body.start_ms,
      end_ms: body.end_ms,
      segment_type: body.segment_type ?? 'full_clip',
      subtitle_data: body.subtitle_data ?? null,
      subtitle_source_type: body.subtitle_source_type ?? null,
      difficulty_rating: body.difficulty_rating ?? null,
      ordering_index: body.ordering_index ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Bulk update segment ordering or individual segment fields
  const body = await request.json();

  if (Array.isArray(body)) {
    // Bulk reorder: [{id, ordering_index}]
    for (const item of body) {
      await supabase
        .from('clip_segments')
        .update({ ordering_index: item.ordering_index })
        .eq('id', item.id)
        .eq('clip_id', clipId);
    }
    return NextResponse.json({ updated: true });
  }

  // Single segment update
  if (!body.id) {
    return NextResponse.json({ error: 'segment id is required' }, { status: 400 });
  }

  const allowedFields = [
    'display_label', 'start_ms', 'end_ms', 'segment_type',
    'subtitle_data', 'subtitle_source_type', 'subtitle_verified',
    'difficulty_rating', 'ordering_index', 'is_active',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from('clip_segments')
    .update(updates)
    .eq('id', body.id)
    .eq('clip_id', clipId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: 'segment id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('clip_segments')
    .delete()
    .eq('id', body.id)
    .eq('clip_id', clipId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

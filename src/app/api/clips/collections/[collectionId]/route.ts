import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: collection, error } = await supabase
    .from('clip_collections')
    .select('*')
    .eq('id', collectionId)
    .single();

  if (error || !collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  // Get clip count
  const { count } = await supabase
    .from('clips')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  return NextResponse.json({ ...collection, clip_count: count ?? 0 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = ['display_name', 'description', 'collection_type', 'ordering_index', 'is_active'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from('clip_collections')
    .update(updates)
    .eq('id', collectionId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Null out collection_id on clips (don't delete the clips)
  await supabase
    .from('clips')
    .update({ collection_id: null })
    .eq('collection_id', collectionId);

  const { error } = await supabase
    .from('clip_collections')
    .delete()
    .eq('id', collectionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

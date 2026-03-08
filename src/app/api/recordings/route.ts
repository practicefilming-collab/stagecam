import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { chunk_id, room_id, video_url, duration_seconds, size_bytes } = body;

  const { data, error } = await supabase
    .from('recordings')
    .insert({
      chunk_id,
      user_id: user.id,
      room_id,
      video_url,
      duration_seconds,
      size_bytes: size_bytes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chunkId = searchParams.get('chunk_id');
  const roomId = searchParams.get('room_id');

  let query = supabase.from('recordings').select('*');

  if (chunkId) query = query.eq('chunk_id', chunkId);
  if (roomId) query = query.eq('room_id', roomId);

  const { data } = await query.order('created_at', { ascending: false });
  return NextResponse.json(data ?? []);
}

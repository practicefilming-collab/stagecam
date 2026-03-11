import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const lineId = body.line_id ?? body.chunk_id;
  const { room_id, video_url, duration_seconds, size_bytes } = body;

  if (!lineId || !room_id || !video_url) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('recordings')
    .insert({
      chunk_id: lineId,
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

  return NextResponse.json({
    ...data,
    line_id: data.chunk_id,
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get('line_id') ?? searchParams.get('chunk_id');
  const roomId = searchParams.get('room_id');

  let query = supabase.from('recordings').select('*');

  if (lineId) query = query.eq('chunk_id', lineId);
  if (roomId) query = query.eq('room_id', roomId);

  const { data } = await query.order('created_at', { ascending: false });
  return NextResponse.json((data ?? []).map((recording) => ({
    ...recording,
    line_id: recording.chunk_id,
  })));
}

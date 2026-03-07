import { createClient } from '@/lib/supabase/server';
import { generateRoomCode } from '@/lib/utils';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { script_id, selection_mode, selected_act_id, selected_scene_id, defer_script } = body;

  if (!script_id && !defer_script) {
    return NextResponse.json({ error: 'script_id required' }, { status: 400 });
  }

  // Generate unique room code
  let roomCode: string;
  let attempts = 0;
  do {
    roomCode = generateRoomCode();
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('room_code', roomCode)
      .single();
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      creator_id: user.id,
      script_id: script_id ?? null,
      selection_mode: selection_mode ?? 'auto',
      selected_act_id: selected_act_id ?? null,
      selected_scene_id: selected_scene_id ?? null,
      room_code: roomCode,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add creator as participant
  await supabase.from('room_participants').insert({
    room_id: room.id,
    user_id: user.id,
    is_creator: true,
  });

  return NextResponse.json(room);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const { data: room } = await supabase
      .from('rooms')
      .select('*, scripts(*)')
      .eq('room_code', code)
      .single();
    return NextResponse.json(room);
  }

  // List user's rooms
  const { data: participations } = await supabase
    .from('room_participants')
    .select('room_id')
    .eq('user_id', user.id);

  const roomIds = (participations ?? []).map((p) => p.room_id);

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*, scripts(title, year)')
    .in('id', roomIds)
    .order('created_at', { ascending: false });

  return NextResponse.json(rooms ?? []);
}

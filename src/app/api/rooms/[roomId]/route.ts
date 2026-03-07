import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room || room.creator_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (room.status !== 'waiting') {
    return NextResponse.json({ error: 'Room already started' }, { status: 400 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.script_id !== undefined) updates.script_id = body.script_id;
  if (body.selection_mode !== undefined) updates.selection_mode = body.selection_mode;
  if (body.selected_act_id !== undefined) updates.selected_act_id = body.selected_act_id;
  if (body.selected_scene_id !== undefined) updates.selected_scene_id = body.selected_scene_id;

  const { data: updated, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', roomId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}

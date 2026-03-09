import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { runMatchmaking } from '@/lib/matchmaking';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get room
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

  if (!room.script_id) {
    return NextResponse.json({ error: 'No script selected' }, { status: 400 });
  }

  // Parse optional role draft from request body
  let roleDraft: Record<string, string[]> | undefined;
  try {
    const body = await request.json();
    if (body.roleDraft && typeof body.roleDraft === 'object') {
      roleDraft = body.roleDraft;
    }
  } catch {
    // No body or invalid JSON — proceed without role draft
  }

  // Get participants
  const { data: participants } = await supabase
    .from('room_participants')
    .select('user_id, profiles(display_name)')
    .eq('room_id', roomId)
    .order('joined_at');

  const participantIds = (participants ?? []).map((p) => p.user_id);
  const participantNames = new Map<string, string>();
  (participants ?? []).forEach((p) => {
    const profile = p.profiles as unknown as { display_name: string } | null;
    participantNames.set(p.user_id, profile?.display_name ?? 'Unknown');
  });

  try {
    const result = await runMatchmaking(supabase, {
      roomId,
      scriptId: room.script_id,
      selectionMode: room.selection_mode,
      selectedActId: room.selected_act_id,
      selectedSceneId: room.selected_scene_id,
      participantIds,
      participantNames,
      roleDraft,
    });

    // Write assignments to room_participants
    for (const assignment of result.assignments) {
      await supabase
        .from('room_participants')
        .update({ assigned_chunks: assignment.chunks })
        .eq('room_id', roomId)
        .eq('user_id', assignment.userId);
    }

    // Update room status
    await supabase
      .from('rooms')
      .update({
        status: 'active',
        selected_scene_id: result.sceneId,
        started_at: new Date().toISOString(),
      })
      .eq('id', roomId);

    return NextResponse.json({ success: true, sceneId: result.sceneId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Matchmaking failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

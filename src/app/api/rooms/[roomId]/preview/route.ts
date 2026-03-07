import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { assignChunks } from '@/lib/assignment/chunk-assigner';
import { selectBestScene } from '@/lib/assignment/auto-selector';

export async function GET(
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

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (!room.script_id) {
    return NextResponse.json({ error: 'No script selected' }, { status: 400 });
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

  // Determine scene
  let sceneId = room.selected_scene_id;

  if (room.selection_mode === 'auto' && !sceneId) {
    const { data: acts } = await supabase
      .from('acts')
      .select('id')
      .eq('script_id', room.script_id);
    const actIds = (acts ?? []).map((a) => a.id);

    let scenesQuery = supabase.from('scenes').select('*');
    if (room.selected_act_id) {
      scenesQuery = scenesQuery.eq('act_id', room.selected_act_id);
    } else {
      scenesQuery = scenesQuery.in('act_id', actIds);
    }

    const { data: scenes } = await scenesQuery.order('scene_number');

    if (scenes && scenes.length > 0) {
      const sceneIds = scenes.map((s) => s.id);
      const { data: recordings } = await supabase
        .from('recordings')
        .select('chunk_id, chunks!inner(scene_id)')
        .in('chunks.scene_id', sceneIds);

      const countMap = new Map<string, number>();
      (recordings ?? []).forEach((r: Record<string, unknown>) => {
        const chunks = r.chunks as { scene_id: string };
        countMap.set(chunks.scene_id, (countMap.get(chunks.scene_id) ?? 0) + 1);
      });

      const selected = selectBestScene(scenes, countMap, participantIds.length);
      if (selected) sceneId = selected.id;
    }
  }

  if (!sceneId) {
    return NextResponse.json({ error: 'No scene could be determined' }, { status: 400 });
  }

  // Get scene info
  const { data: scene } = await supabase
    .from('scenes')
    .select('*, acts(act_number)')
    .eq('id', sceneId)
    .single();

  // Get chunks for the scene
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('scene_id', sceneId)
    .order('chunk_in_scene');

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ error: 'No chunks in scene' }, { status: 400 });
  }

  // Preview assignments
  const assignments = assignChunks(chunks, participantIds);

  // Build call sheet
  const callSheet = assignments.map((a) => ({
    userId: a.userId,
    displayName: participantNames.get(a.userId) ?? 'Unknown',
    totalChunks: a.chunks.length,
    character: a.character,
    dialogueCount: a.chunks.filter((c) => c.role === 'dialogue').length,
    actionCount: a.chunks.filter((c) => c.role !== 'dialogue').length,
  }));

  const act = scene?.acts as unknown as { act_number: number } | null;

  return NextResponse.json({
    sceneId,
    sceneHeading: scene?.scene_heading,
    sceneNumber: scene?.scene_number,
    actNumber: act?.act_number,
    totalChunks: chunks.length,
    callSheet,
  });
}

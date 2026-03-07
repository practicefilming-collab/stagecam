import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { assignChunks } from '@/lib/assignment/chunk-assigner';
import { selectBestScene } from '@/lib/assignment/auto-selector';

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

  // Get participants
  const { data: participants } = await supabase
    .from('room_participants')
    .select('user_id')
    .eq('room_id', roomId)
    .order('joined_at');

  const participantIds = (participants ?? []).map((p) => p.user_id);

  // Determine scene scope
  let sceneId = room.selected_scene_id;

  if (room.selection_mode === 'auto' && !sceneId) {
    // Auto-select scene
    const actId = room.selected_act_id;
    let scenesQuery = supabase.from('scenes').select('*');

    if (actId) {
      scenesQuery = scenesQuery.eq('act_id', actId);
    } else {
      // Get all acts for this script
      const { data: acts } = await supabase
        .from('acts')
        .select('id')
        .eq('script_id', room.script_id);
      const actIds = (acts ?? []).map((a) => a.id);
      scenesQuery = scenesQuery.in('act_id', actIds);
    }

    const { data: scenes } = await scenesQuery.order('scene_number');

    if (scenes && scenes.length > 0) {
      // Get recording counts per scene
      const sceneIds = scenes.map((s) => s.id);
      const { data: chunkData } = await supabase
        .from('chunks')
        .select('scene_id')
        .in('scene_id', sceneIds);

      const { data: recordings } = await supabase
        .from('recordings')
        .select('chunk_id, chunks!inner(scene_id)')
        .in('chunks.scene_id', sceneIds);

      const countMap = new Map<string, number>();
      (recordings ?? []).forEach((r: Record<string, unknown>) => {
        const chunks = r.chunks as { scene_id: string };
        const sid = chunks.scene_id;
        countMap.set(sid, (countMap.get(sid) ?? 0) + 1);
      });

      const selected = selectBestScene(scenes, countMap, participantIds.length);
      if (selected) {
        sceneId = selected.id;
      }
    }
  }

  if (!sceneId) {
    return NextResponse.json({ error: 'No scene selected' }, { status: 400 });
  }

  // Get chunks for the scene
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('scene_id', sceneId)
    .order('chunk_in_scene');

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ error: 'No chunks in scene' }, { status: 400 });
  }

  // Assign chunks
  const assignments = assignChunks(chunks, participantIds);

  // Update participants with assignments
  for (const assignment of assignments) {
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
      selected_scene_id: sceneId,
      started_at: new Date().toISOString(),
    })
    .eq('id', roomId);

  return NextResponse.json({ success: true, sceneId });
}

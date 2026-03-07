import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find scenes where user has recordings
  const { data: userRecordings } = await supabase
    .from('recordings')
    .select('chunk_id, chunks!inner(scene_id)')
    .eq('user_id', user.id);

  if (!userRecordings || userRecordings.length === 0) {
    return NextResponse.json([]);
  }

  // Get unique scene IDs
  const sceneIds = [...new Set(
    userRecordings.map((r: Record<string, unknown>) => (r.chunks as { scene_id: string }).scene_id)
  )];

  // For each scene, find if other users have recorded other chunks
  const { data: scenes } = await supabase
    .from('scenes')
    .select('*, acts!inner(*, scripts!inner(title, year))')
    .in('id', sceneIds);

  const panels = [];

  for (const scene of scenes ?? []) {
    // Get all recordings for this scene
    const { data: sceneRecordings } = await supabase
      .from('recordings')
      .select('*, chunks!inner(chunk_in_scene, type, character), profiles!inner(display_name)')
      .eq('chunks.scene_id', scene.id)
      .order('chunks.chunk_in_scene');

    const uniqueParticipants = [...new Set(
      (sceneRecordings ?? []).map((r: Record<string, unknown>) => r.user_id as string)
    )];

    const totalChunks = scene.total_chunks;
    const recordedChunks = new Set(
      (sceneRecordings ?? []).map((r: Record<string, unknown>) => (r.chunks as { chunk_in_scene: number }).chunk_in_scene)
    ).size;

    panels.push({
      scene,
      recordings: sceneRecordings ?? [],
      participantCount: uniqueParticipants.length,
      coverage: totalChunks > 0 ? recordedChunks / totalChunks : 0,
      isComplete: recordedChunks >= totalChunks,
    });
  }

  return NextResponse.json(panels);
}

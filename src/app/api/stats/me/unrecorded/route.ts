import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scriptId = searchParams.get('scriptId');
  const character = searchParams.get('character');

  if (!scriptId || !character) {
    return NextResponse.json({ error: 'scriptId and character are required' }, { status: 400 });
  }

  // Get all dialogue chunks for this character in this script
  const { data: chunks } = await supabase
    .from('chunks')
    .select(`
      id,
      scene_id,
      scenes!inner(
        id,
        scene_number,
        scene_heading,
        act_id,
        acts!inner(
          id,
          act_number,
          script_id
        )
      )
    `)
    .eq('type', 'dialogue')
    .eq('character', character)
    .eq('scenes.acts.script_id', scriptId);

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ scenes: [] });
  }

  // Get all recordings by this user for those chunk IDs
  const chunkIds = chunks.map((c) => c.id);
  const { data: recordings } = await supabase
    .from('recordings')
    .select('chunk_id')
    .eq('user_id', user.id)
    .in('chunk_id', chunkIds);

  const recordedChunkIds = new Set((recordings ?? []).map((r) => r.chunk_id));

  // Group by scene
  type SceneJoin = {
    id: string;
    scene_number: number;
    scene_heading: string | null;
    act_id: string;
    acts: { id: string; act_number: number; script_id: string };
  };

  const sceneMap = new Map<string, {
    sceneId: string;
    sceneNumber: number;
    sceneHeading: string | null;
    actNumber: number;
    totalLines: number;
    recordedLines: number;
  }>();

  for (const chunk of chunks) {
    const scene = chunk.scenes as unknown as SceneJoin;
    const act = scene.acts;

    if (!sceneMap.has(scene.id)) {
      sceneMap.set(scene.id, {
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        sceneHeading: scene.scene_heading,
        actNumber: act.act_number,
        totalLines: 0,
        recordedLines: 0,
      });
    }

    const entry = sceneMap.get(scene.id)!;
    entry.totalLines++;
    if (recordedChunkIds.has(chunk.id)) {
      entry.recordedLines++;
    }
  }

  // Return only scenes with remaining lines, sorted by act then scene number
  const scenes = [...sceneMap.values()]
    .filter((s) => s.totalLines - s.recordedLines > 0)
    .map((s) => ({
      ...s,
      remainingLines: s.totalLines - s.recordedLines,
    }))
    .sort((a, b) => a.actNumber - b.actNumber || a.sceneNumber - b.sceneNumber);

  return NextResponse.json({ scenes });
}

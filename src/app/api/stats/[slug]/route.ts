/** Script dashboard API: chunk breakdown, coverage, characters, rehearsal balance. */
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Fetch script by slug
  const { data: script } = await supabase
    .from('scripts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  }

  // 2. Fetch acts with nested scenes
  const { data: acts } = await supabase
    .from('acts')
    .select('*, scenes(*)')
    .eq('script_id', script.id)
    .order('act_number');

  if (!acts || acts.length === 0) {
    return NextResponse.json({ error: 'No acts found' }, { status: 404 });
  }

  // Collect all scene IDs
  const allScenes: Array<{
    id: string;
    scene_number: number;
    scene_heading: string | null;
    total_chunks: number;
    performable_chunks: number;
    unique_characters: string[];
    actId: string;
    actNumber: number;
  }> = [];

  for (const act of acts) {
    const scenes = (act.scenes ?? []) as Array<{
      id: string;
      scene_number: number;
      scene_heading: string | null;
      total_chunks: number;
      performable_chunks: number;
      unique_characters: string[];
    }>;
    for (const scene of scenes) {
      allScenes.push({
        ...scene,
        actId: act.id,
        actNumber: act.act_number,
      });
    }
  }

  const allSceneIds = allScenes.map((s) => s.id);

  // 3-5. Parallel queries: chunks, recordings, rooms
  const [chunksResult, recordingsResult, roomsResult] = await Promise.all([
    // 3. All chunks for aggregation
    supabase
      .from('chunks')
      .select('id, type, character, is_system, scene_id')
      .in('scene_id', allSceneIds),

    // 4. Recordings for coverage (by performable chunk_ids)
    // Placeholder — will query after chunks are available
    Promise.resolve({ data: null }),

    // 5. Rooms for rehearsal counts
    supabase
      .from('rooms')
      .select('selected_scene_id')
      .eq('script_id', script.id)
      .not('selected_scene_id', 'is', null),
  ]);

  const chunks = chunksResult.data ?? [];
  const rooms = roomsResult.data ?? [];

  // Query recordings using direct chunk_id lookup (PostgREST .in on joined columns is unreliable)
  const performableChunkIds = chunks.filter((c) => !c.is_system).map((c) => c.id);
  let recordings: { chunk_id: string }[] = [];
  if (performableChunkIds.length > 0) {
    const { data: recs } = await supabase
      .from('recordings')
      .select('chunk_id')
      .in('chunk_id', performableChunkIds);
    recordings = recs ?? [];
  }

  // Build chunk-to-scene map for per-scene aggregation
  const chunkToScene = new Map<string, string>();
  for (const chunk of chunks) {
    chunkToScene.set(chunk.id, chunk.scene_id);
  }

  // === Aggregate chunk breakdown ===
  const chunkBreakdown = { dialogue: 0, action: 0, scene_heading: 0, transition: 0 };
  let systemCount = 0;
  const characterMap = new Map<string, number>();

  for (const chunk of chunks) {
    const t = chunk.type as keyof typeof chunkBreakdown;
    if (t in chunkBreakdown) chunkBreakdown[t]++;
    if (chunk.is_system) systemCount++;
    if (chunk.type === 'dialogue' && chunk.character) {
      characterMap.set(chunk.character, (characterMap.get(chunk.character) ?? 0) + 1);
    }
  }

  const performableCount = chunks.length - systemCount;

  const characters = [...characterMap.entries()]
    .map(([name, dialogueChunks]) => ({ name, dialogueChunks }))
    .sort((a, b) => b.dialogueChunks - a.dialogueChunks);

  // === Aggregate recording coverage per scene (distinct chunk_ids) ===
  const recordedPerScene = new Map<string, Set<string>>();
  for (const rec of recordings) {
    const sceneId = chunkToScene.get(rec.chunk_id);
    if (!sceneId) continue;
    if (!recordedPerScene.has(sceneId)) recordedPerScene.set(sceneId, new Set());
    recordedPerScene.get(sceneId)!.add(rec.chunk_id);
  }

  // Total distinct recorded chunks across all scenes
  const allRecordedChunkIds = new Set<string>();
  for (const set of recordedPerScene.values()) {
    for (const id of set) allRecordedChunkIds.add(id);
  }
  const totalRecorded = allRecordedChunkIds.size;

  // === Aggregate rehearsal counts per scene ===
  const rehearsalPerScene = new Map<string, number>();
  for (const room of rooms) {
    const sid = room.selected_scene_id as string;
    rehearsalPerScene.set(sid, (rehearsalPerScene.get(sid) ?? 0) + 1);
  }

  // === Build acts response ===
  const actsResponse = acts.map((act) => {
    const actScenes = allScenes
      .filter((s) => s.actId === act.id)
      .sort((a, b) => a.scene_number - b.scene_number);

    let actPerformable = 0;
    let actRecorded = 0;

    const scenesResponse = actScenes.map((scene) => {
      const recorded = recordedPerScene.get(scene.id)?.size ?? 0;
      const perf = scene.performable_chunks ?? scene.total_chunks;
      actPerformable += perf;
      actRecorded += recorded;

      return {
        id: scene.id,
        sceneNumber: scene.scene_number,
        sceneHeading: scene.scene_heading,
        totalChunks: scene.total_chunks,
        performableChunks: perf,
        uniqueCharacters: scene.unique_characters ?? [],
        recorded,
        completionPct: perf > 0 ? Math.round((recorded / perf) * 100) : 0,
        rehearsalCount: rehearsalPerScene.get(scene.id) ?? 0,
      };
    });

    return {
      id: act.id,
      actNumber: act.act_number,
      totalChunks: act.total_chunks,
      completion: {
        totalPerformable: actPerformable,
        recorded: actRecorded,
        percentage: actPerformable > 0 ? Math.round((actRecorded / actPerformable) * 100) : 0,
      },
      scenes: scenesResponse,
    };
  });

  // === Rehearsal balance: hot/cold spots ===
  const totalRehearsals = rooms.length;
  const sceneRehearsalStats = allScenes
    .filter((s) => (s.performable_chunks ?? s.total_chunks) > 0)
    .map((s) => ({
      sceneId: s.id,
      sceneNumber: s.scene_number,
      actNumber: s.actNumber,
      count: rehearsalPerScene.get(s.id) ?? 0,
    }));

  const hotSpots = [...sceneRehearsalStats]
    .sort((a, b) => b.count - a.count)
    .filter((s) => s.count > 0)
    .slice(0, 3);

  const coldSpots = sceneRehearsalStats
    .filter((s) => s.count === 0)
    .sort((a, b) => a.actNumber - b.actNumber || a.sceneNumber - b.sceneNumber);

  return NextResponse.json({
    script: {
      id: script.id,
      title: script.title,
      rank: script.rank,
      year: script.year,
      slug: script.slug,
      totalActs: script.total_acts,
      totalScenes: script.total_scenes,
      totalChunks: script.total_chunks,
    },
    chunkBreakdown: {
      ...chunkBreakdown,
      system: systemCount,
      performable: performableCount,
    },
    characters,
    completion: {
      totalPerformable: performableCount,
      recorded: totalRecorded,
      percentage: performableCount > 0 ? Math.round((totalRecorded / performableCount) * 100) : 0,
    },
    acts: actsResponse,
    rehearsalBalance: {
      totalRehearsals,
      hotSpots,
      coldSpots,
    },
  });
}

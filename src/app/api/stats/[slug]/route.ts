/** Script dashboard API: line breakdown, coverage, characters, rehearsal balance. */
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

export async function GET(
  _request: Request,
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
    rehearsable_chunks: number;
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
      rehearsable_chunks: number;
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

  // 3-5. Parallel queries: lines, recordings, rooms
  const [lineRowsResult, , roomsResult] = await Promise.all([
    // 3. All lines for aggregation
    supabase
      .from('chunks')
      .select('id, type, character, is_system, scene_id')
      .in('scene_id', allSceneIds),

    // 4. Recordings for coverage (by rehearsable line ids)
    // Placeholder — will query after line rows are available
    Promise.resolve({ data: null }),

    // 5. Rooms for rehearsal counts
    supabase
      .from('rooms')
      .select('selected_scene_id')
      .eq('script_id', script.id)
      .not('selected_scene_id', 'is', null),
  ]);

  const lineRows = lineRowsResult.data ?? [];
  const rooms = roomsResult.data ?? [];

  // Query recordings using direct chunk_id lookup (PostgREST .in on joined columns is unreliable).
  const performableLineIds = lineRows.filter((line) => !line.is_system).map((line) => line.id);
  let recordings: { chunk_id: string }[] = [];
  if (performableLineIds.length > 0) {
    const { data: recs } = await supabase
      .from('recordings')
      .select('chunk_id')
      .in('chunk_id', performableLineIds);
    recordings = recs ?? [];
  }

  // Build line-to-scene map for per-scene aggregation.
  const lineToScene = new Map<string, string>();
  for (const line of lineRows) {
    lineToScene.set(line.id, line.scene_id);
  }

  // === Aggregate line breakdown ===
  const lineBreakdown = { dialogue: 0, action: 0, scene_heading: 0, transition: 0 };
  let systemCount = 0;
  const characterMap = new Map<string, number>();

  for (const line of lineRows) {
    const t = line.type as keyof typeof lineBreakdown;
    if (t in lineBreakdown) lineBreakdown[t]++;
    if (line.is_system) systemCount++;
    if (line.type === 'dialogue' && line.character) {
      characterMap.set(line.character, (characterMap.get(line.character) ?? 0) + 1);
    }
  }

  const performableCount = lineRows.length - systemCount;

  const characters = [...characterMap.entries()]
    .map(([name, dialogueLines]) => ({ name, dialogueLines }))
    .sort((a, b) => b.dialogueLines - a.dialogueLines);

  // === Aggregate recording coverage per scene (distinct line ids) ===
  const recordedPerScene = new Map<string, Set<string>>();
  for (const rec of recordings) {
    const sceneId = lineToScene.get(rec.chunk_id);
    if (!sceneId) continue;
    if (!recordedPerScene.has(sceneId)) recordedPerScene.set(sceneId, new Set());
    recordedPerScene.get(sceneId)!.add(rec.chunk_id);
  }

  // Total distinct recorded lines across all scenes
  const allRecordedLineIds = new Set<string>();
  for (const set of recordedPerScene.values()) {
    for (const id of set) allRecordedLineIds.add(id);
  }
  const totalRecorded = allRecordedLineIds.size;

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
      const perf = scene.rehearsable_chunks ?? scene.total_chunks;
      actPerformable += perf;
      actRecorded += recorded;

      return {
        id: scene.id,
        sceneNumber: scene.scene_number,
        sceneHeading: scene.scene_heading,
        totalLines: scene.total_chunks,
        rehearsableLines: perf,
        uniqueCharacters: scene.unique_characters ?? [],
        recordedLines: recorded,
        completionPct: perf > 0 ? Math.round((recorded / perf) * 100) : 0,
        rehearsalCount: rehearsalPerScene.get(scene.id) ?? 0,
      };
    });

    return {
      id: act.id,
      actNumber: act.act_number,
      totalLines: act.total_chunks,
      completion: {
        totalRehearsableLines: actPerformable,
        recordedLines: actRecorded,
        percentage: actPerformable > 0 ? Math.round((actRecorded / actPerformable) * 100) : 0,
      },
      scenes: scenesResponse,
    };
  });

  // === Rehearsal balance: hot/cold spots ===
  const totalRehearsals = rooms.length;
  const sceneRehearsalStats = allScenes
    .filter((s) => (s.rehearsable_chunks ?? s.total_chunks) > 0)
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
      totalLines: script.total_chunks,
    },
    lineBreakdown: {
      ...lineBreakdown,
      systemLines: systemCount,
      rehearsableLines: performableCount,
    },
    characters,
    completion: {
      totalRehearsableLines: performableCount,
      recordedLines: totalRecorded,
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

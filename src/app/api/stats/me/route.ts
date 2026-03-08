import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all recordings by this user, joined with chunk → scene → act → script
  const { data: recordings } = await supabase
    .from('recordings')
    .select(`
      id,
      chunk_id,
      created_at,
      chunks!inner(
        id,
        type,
        character,
        scene_id,
        scenes!inner(
          id,
          scene_number,
          scene_heading,
          act_id,
          acts!inner(
            id,
            act_number,
            script_id,
            scripts!inner(id, title, year, slug, rank)
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (!recordings || recordings.length === 0) {
    return NextResponse.json({
      characters: [],
      recentSessions: [],
      summary: {
        totalRecordings: 0,
        uniqueChunksRecorded: 0,
        scriptsContributedTo: 0,
        typeBreakdown: { dialogue: 0, action: 0, scene_heading: 0, transition: 0 },
      },
    });
  }

  // Extract unique characters played, grouped by script
  type ChunkJoin = {
    id: string;
    type: string;
    character: string | null;
    scene_id: string;
    scenes: {
      id: string;
      scene_number: number;
      scene_heading: string | null;
      act_id: string;
      acts: {
        id: string;
        act_number: number;
        script_id: string;
        scripts: { id: string; title: string; year: number | null; slug: string; rank: number | null };
      };
    };
  };

  // Group recordings by character+script
  const charScriptMap = new Map<string, {
    character: string;
    scriptId: string;
    scriptTitle: string;
    scriptYear: number | null;
    scriptSlug: string;
    actChunks: Map<number, { recorded: Set<string>; total: number }>;
    recordedChunkIds: Set<string>;
  }>();

  // Collect all script+act combos to query total dialogue per character
  const scriptActPairs = new Set<string>();

  for (const rec of recordings) {
    const chunk = rec.chunks as unknown as ChunkJoin;
    if (!chunk.character) continue;

    const act = chunk.scenes.acts;
    const script = act.scripts;
    const key = `${chunk.character}::${script.id}`;

    scriptActPairs.add(`${script.id}::${act.id}::${act.act_number}`);

    if (!charScriptMap.has(key)) {
      charScriptMap.set(key, {
        character: chunk.character,
        scriptId: script.id,
        scriptTitle: script.title,
        scriptYear: script.year,
        scriptSlug: script.slug,
        actChunks: new Map(),
        recordedChunkIds: new Set(),
      });
    }

    const entry = charScriptMap.get(key)!;
    entry.recordedChunkIds.add(chunk.id);

    if (!entry.actChunks.has(act.act_number)) {
      entry.actChunks.set(act.act_number, { recorded: new Set(), total: 0 });
    }
    entry.actChunks.get(act.act_number)!.recorded.add(chunk.id);
  }

  // Query total dialogue chunks per character per act for each script
  const scriptIds = [...new Set([...charScriptMap.values()].map(e => e.scriptId))];

  for (const scriptId of scriptIds) {
    const characters = [...charScriptMap.values()].filter(e => e.scriptId === scriptId).map(e => e.character);

    const { data: totalChunks } = await supabase
      .from('chunks')
      .select('id, character, scenes!inner(acts!inner(act_number, script_id))')
      .eq('type', 'dialogue')
      .in('character', characters)
      .eq('scenes.acts.script_id', scriptId);

    for (const tc of totalChunks ?? []) {
      const actInfo = (tc.scenes as unknown as { acts: { act_number: number; script_id: string } }).acts;
      const key = `${tc.character}::${scriptId}`;
      const entry = charScriptMap.get(key);
      if (!entry) continue;

      if (!entry.actChunks.has(actInfo.act_number)) {
        entry.actChunks.set(actInfo.act_number, { recorded: new Set(), total: 0 });
      }
      entry.actChunks.get(actInfo.act_number)!.total++;
    }
  }

  // Build character cards
  const characters = [...charScriptMap.values()].map(entry => {
    const acts = [...entry.actChunks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([actNumber, data]) => ({
        actNumber,
        recorded: data.recorded.size,
        total: data.total,
      }));

    const totalRecorded = acts.reduce((s, a) => s + a.recorded, 0);
    const totalChunks = acts.reduce((s, a) => s + a.total, 0);

    return {
      character: entry.character,
      scriptTitle: entry.scriptTitle,
      scriptYear: entry.scriptYear,
      scriptSlug: entry.scriptSlug,
      acts,
      totalRecorded,
      totalChunks,
      completionPct: totalChunks > 0 ? Math.round((totalRecorded / totalChunks) * 100) : 0,
    };
  }).sort((a, b) => b.totalRecorded - a.totalRecorded);

  // Recent sessions: group recordings by date
  const recentSessions = recordings.slice(0, 20).map(rec => {
    const chunk = rec.chunks as unknown as ChunkJoin;
    return {
      recordingId: rec.id,
      character: chunk.character,
      sceneHeading: chunk.scenes.scene_heading,
      scriptTitle: chunk.scenes.acts.scripts.title,
      createdAt: rec.created_at,
    };
  });

  // Build summary including all recording types (not just dialogue)
  const uniqueScriptIds = new Set<string>();
  const typeBreakdown = { dialogue: 0, action: 0, scene_heading: 0, transition: 0 };
  const uniqueChunkIds = new Set<string>();

  for (const rec of recordings) {
    const chunk = rec.chunks as unknown as ChunkJoin;
    uniqueChunkIds.add(chunk.id);
    uniqueScriptIds.add(chunk.scenes.acts.scripts.id);
    const t = chunk.type as keyof typeof typeBreakdown;
    if (t in typeBreakdown) typeBreakdown[t]++;
  }

  const summary = {
    totalRecordings: recordings.length,
    uniqueChunksRecorded: uniqueChunkIds.size,
    scriptsContributedTo: uniqueScriptIds.size,
    typeBreakdown,
  };

  return NextResponse.json({ characters, recentSessions, summary });
}

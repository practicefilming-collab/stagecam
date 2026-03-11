import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all recordings by this user, joined with line → scene → act → script
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
      recentScenes: [],
      summary: {
        totalRecordings: 0,
        uniqueLinesRecorded: 0,
        scriptsContributedTo: 0,
        typeBreakdown: { dialogue: 0, action: 0, scene_heading: 0, transition: 0 },
      },
    });
  }

  // Extract unique characters played, grouped by script
  type LineJoin = {
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
    actLines: Map<number, { recorded: Set<string>; total: number }>;
    recordedLineIds: Set<string>;
  }>();

  for (const rec of recordings) {
    const line = rec.chunks as unknown as LineJoin;
    if (!line.character) continue;

    const act = line.scenes.acts;
    const script = act.scripts;
    const key = `${line.character}::${script.id}`;

    if (!charScriptMap.has(key)) {
      charScriptMap.set(key, {
        character: line.character,
        scriptId: script.id,
        scriptTitle: script.title,
        scriptYear: script.year,
        scriptSlug: script.slug,
        actLines: new Map(),
        recordedLineIds: new Set(),
      });
    }

    const entry = charScriptMap.get(key)!;
    entry.recordedLineIds.add(line.id);

    if (!entry.actLines.has(act.act_number)) {
      entry.actLines.set(act.act_number, { recorded: new Set(), total: 0 });
    }
    entry.actLines.get(act.act_number)!.recorded.add(line.id);
  }

  // Query total dialogue lines per character per act for each script
  const scriptIds = [...new Set([...charScriptMap.values()].map(e => e.scriptId))];

  for (const scriptId of scriptIds) {
    const characters = [...charScriptMap.values()].filter(e => e.scriptId === scriptId).map(e => e.character);

    const { data: totalLines } = await supabase
      .from('chunks')
      .select('id, character, scenes!inner(acts!inner(act_number, script_id))')
      .eq('type', 'dialogue')
      .in('character', characters)
      .eq('scenes.acts.script_id', scriptId);

    for (const tc of totalLines ?? []) {
      const actInfo = (tc.scenes as unknown as { acts: { act_number: number; script_id: string } }).acts;
      const key = `${tc.character}::${scriptId}`;
      const entry = charScriptMap.get(key);
      if (!entry) continue;

      if (!entry.actLines.has(actInfo.act_number)) {
        entry.actLines.set(actInfo.act_number, { recorded: new Set(), total: 0 });
      }
      entry.actLines.get(actInfo.act_number)!.total++;
    }
  }

  // Build character cards
  const characters = [...charScriptMap.values()].map(entry => {
    const acts = [...entry.actLines.entries()]
      .sort(([a], [b]) => a - b)
      .map(([actNumber, data]) => ({
        actNumber,
        recorded: data.recorded.size,
        total: data.total,
      }));

    const totalRecorded = acts.reduce((s, a) => s + a.recorded, 0);
    const totalLines = acts.reduce((s, a) => s + a.total, 0);

    return {
      character: entry.character,
      scriptId: entry.scriptId,
      scriptTitle: entry.scriptTitle,
      scriptYear: entry.scriptYear,
      scriptSlug: entry.scriptSlug,
      acts,
      totalRecorded,
      totalLines,
      completionPct: totalLines > 0 ? Math.round((totalRecorded / totalLines) * 100) : 0,
    };
  }).sort((a, b) => b.totalRecorded - a.totalRecorded);

  // Recent scenes: group recordings by (scene_id, date), then by character
  const sceneGroupMap = new Map<string, {
    sceneId: string;
    sceneHeading: string | null;
    scriptTitle: string;
    date: string;
    entriesMap: Map<string, { character: string | null; count: number; recordingIds: string[] }>;
  }>();

  for (const rec of recordings) {
    const line = rec.chunks as unknown as LineJoin;
    const date = rec.created_at.slice(0, 10); // ISO date (day only)
    const groupKey = `${line.scenes.id}::${date}`;
    const charKey = line.character ?? '__narrator__';

    if (!sceneGroupMap.has(groupKey)) {
      sceneGroupMap.set(groupKey, {
        sceneId: line.scenes.id,
        sceneHeading: line.scenes.scene_heading,
        scriptTitle: line.scenes.acts.scripts.title,
        date,
        entriesMap: new Map(),
      });
    }

    const group = sceneGroupMap.get(groupKey)!;
    if (!group.entriesMap.has(charKey)) {
      group.entriesMap.set(charKey, { character: line.character, count: 0, recordingIds: [] });
    }
    const entry = group.entriesMap.get(charKey)!;
    entry.count++;
    entry.recordingIds.push(rec.id);
  }

  const recentScenes = [...sceneGroupMap.values()]
    .slice(0, 10)
    .map(g => ({
      sceneId: g.sceneId,
      sceneHeading: g.sceneHeading,
      scriptTitle: g.scriptTitle,
      date: g.date,
      entries: [...g.entriesMap.values()],
    }));

  // Build summary including all recording types (not just dialogue)
  const uniqueScriptIds = new Set<string>();
  const typeBreakdown = { dialogue: 0, action: 0, scene_heading: 0, transition: 0 };
  const uniqueLineIds = new Set<string>();

  for (const rec of recordings) {
    const line = rec.chunks as unknown as LineJoin;
    uniqueLineIds.add(line.id);
    uniqueScriptIds.add(line.scenes.acts.scripts.id);
    const t = line.type as keyof typeof typeBreakdown;
    if (t in typeBreakdown) typeBreakdown[t]++;
  }

  const summary = {
    totalRecordings: recordings.length,
    uniqueLinesRecorded: uniqueLineIds.size,
    scriptsContributedTo: uniqueScriptIds.size,
    typeBreakdown,
  };

  return NextResponse.json({ characters, recentScenes, summary });
}

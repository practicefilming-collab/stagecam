import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from('ai_profiles')
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, scripts(id, title, year, slug)')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? 'AI profile not found' }, { status: 404 });
  }

  const { data: recordings } = await admin
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
    .eq('ai_profile_id', profileId)
    .eq('recording_source', 'ai_generated')
    .order('created_at', { ascending: false });

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

  const charScriptMap = new Map<string, {
    character: string;
    scriptId: string;
    scriptTitle: string;
    scriptYear: number | null;
    scriptSlug: string;
    actLines: Map<number, { recorded: Set<string>; total: number }>;
  }>();

  const sceneGroupMap = new Map<string, {
    sceneId: string;
    sceneHeading: string | null;
    scriptTitle: string;
    date: string;
    entriesMap: Map<string, { character: string | null; count: number; recordingIds: string[] }>;
  }>();

  const uniqueScriptIds = new Set<string>();
  const uniqueLineIds = new Set<string>();
  const typeBreakdown = { dialogue: 0, action: 0, scene_heading: 0, transition: 0 };

  for (const rec of recordings ?? []) {
    const line = rec.chunks as unknown as LineJoin;
    const act = line.scenes.acts;
    const script = act.scripts;

    uniqueLineIds.add(line.id);
    uniqueScriptIds.add(script.id);

    const type = line.type as keyof typeof typeBreakdown;
    if (type in typeBreakdown) {
      typeBreakdown[type] += 1;
    }

    if (line.character) {
      const key = `${line.character}::${script.id}`;
      if (!charScriptMap.has(key)) {
        charScriptMap.set(key, {
          character: line.character,
          scriptId: script.id,
          scriptTitle: script.title,
          scriptYear: script.year,
          scriptSlug: script.slug,
          actLines: new Map(),
        });
      }

      const entry = charScriptMap.get(key)!;
      if (!entry.actLines.has(act.act_number)) {
        entry.actLines.set(act.act_number, { recorded: new Set(), total: 0 });
      }
      entry.actLines.get(act.act_number)!.recorded.add(line.id);
    }

    const date = rec.created_at.slice(0, 10);
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
    const groupEntry = group.entriesMap.get(charKey)!;
    groupEntry.count += 1;
    groupEntry.recordingIds.push(rec.id);
  }

  const scriptIds = [...new Set([...charScriptMap.values()].map((entry) => entry.scriptId))];
  for (const scriptId of scriptIds) {
    const characters = [...charScriptMap.values()]
      .filter((entry) => entry.scriptId === scriptId)
      .map((entry) => entry.character);

    const { data: totalLines } = await admin
      .from('chunks')
      .select('id, character, scenes!inner(acts!inner(act_number, script_id))')
      .eq('type', 'dialogue')
      .in('character', characters)
      .eq('scenes.acts.script_id', scriptId);

    for (const row of totalLines ?? []) {
      const actInfo = (row.scenes as unknown as { acts: { act_number: number; script_id: string } }).acts;
      const key = `${row.character}::${scriptId}`;
      const entry = charScriptMap.get(key);
      if (!entry) continue;

      if (!entry.actLines.has(actInfo.act_number)) {
        entry.actLines.set(actInfo.act_number, { recorded: new Set(), total: 0 });
      }
      entry.actLines.get(actInfo.act_number)!.total += 1;
    }
  }

  const characters = [...charScriptMap.values()]
    .map((entry) => {
      const acts = [...entry.actLines.entries()]
        .sort(([a], [b]) => a - b)
        .map(([actNumber, data]) => ({
          actNumber,
          recorded: data.recorded.size,
          total: data.total,
        }));

      const totalRecorded = acts.reduce((sum, act) => sum + act.recorded, 0);
      const totalLines = acts.reduce((sum, act) => sum + act.total, 0);

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
    })
    .sort((a, b) => b.totalRecorded - a.totalRecorded);

  const recentScenes = [...sceneGroupMap.values()]
    .slice(0, 10)
    .map((group) => ({
      sceneId: group.sceneId,
      sceneHeading: group.sceneHeading,
      scriptTitle: group.scriptTitle,
      date: group.date,
      entries: [...group.entriesMap.values()],
    }));

  const [{ data: recentRuns }, { data: recentFailures }] = await Promise.all([
    admin
      .from('script_generation_runs')
      .select('id, status, total_lines, persisted_lines, failed_lines, created_at, started_at, finished_at, scripts(title, year)')
      .contains('ai_profile_ids', [profileId])
      .order('created_at', { ascending: false })
      .limit(6),
    admin
      .from('line_generation_records')
      .select('id, error_message, source_line_snapshot, created_at, chunks(character, chunk_in_scene, scenes(scene_number, scene_heading))')
      .eq('ai_profile_id', profileId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  return NextResponse.json({
    profile: {
      id: profile.id,
      scriptId: profile.script_id,
      displayName: profile.display_name,
      status: profile.status,
      platform: profile.platform,
      voicePersonaId: profile.voice_persona_id,
      voicePersonaLabel: profile.voice_persona_label,
      createdAt: profile.created_at,
      scriptTitle: (profile.scripts as { title?: string } | null)?.title ?? 'Unknown script',
      scriptYear: (profile.scripts as { year?: number | null } | null)?.year ?? null,
      scriptSlug: (profile.scripts as { slug?: string | null } | null)?.slug ?? null,
    },
    summary: {
      totalRecordings: recordings?.length ?? 0,
      uniqueLinesRecorded: uniqueLineIds.size,
      scriptsContributedTo: uniqueScriptIds.size,
      typeBreakdown,
    },
    characters,
    recentScenes,
    recentRuns: (recentRuns ?? []).map((run) => ({
      id: run.id,
      status: run.status,
      totalLines: run.total_lines,
      persistedLines: run.persisted_lines,
      failedLines: run.failed_lines,
      createdAt: run.created_at,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      scriptTitle: (run.scripts as { title?: string } | null)?.title ?? 'Unknown script',
      scriptYear: (run.scripts as { year?: number | null } | null)?.year ?? null,
    })),
    recentFailures: (recentFailures ?? []).map((row) => {
      const chunk = row.chunks as {
        character?: string | null;
        chunk_in_scene?: number;
        scenes?: { scene_number?: number; scene_heading?: string | null };
      } | null;
      return {
        id: row.id,
        errorMessage: row.error_message,
        sourceLine: row.source_line_snapshot,
        createdAt: row.created_at,
        character: chunk?.character ?? null,
        chunkInScene: chunk?.chunk_in_scene ?? null,
        sceneNumber: chunk?.scenes?.scene_number ?? null,
        sceneHeading: chunk?.scenes?.scene_heading ?? null,
      };
    }),
  });
}

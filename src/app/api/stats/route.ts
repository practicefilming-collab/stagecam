import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all scripts
  const { data: scripts } = await supabase
    .from('scripts')
    .select('*')
    .order('rank');

  if (!scripts || scripts.length === 0) {
    return NextResponse.json([]);
  }

  // For each script, get scene IDs via acts, then count recorded lines
  const stats = [];
  for (const script of scripts) {
    const { data: acts } = await supabase
      .from('acts')
      .select('scenes(id, rehearsable_chunks)')
      .eq('script_id', script.id);

    const scenes = (acts ?? []).flatMap(
      (a) => (a.scenes ?? []) as { id: string; rehearsable_chunks: number }[]
    );
    const sceneIds = scenes.map((s) => s.id);
    const totalPerformable = scenes.reduce((sum, s) => sum + (s.rehearsable_chunks ?? 0), 0);

    let recordedLines = 0;
    if (sceneIds.length > 0) {
      // Get rehearsable line ids for these scenes
      const { data: performableLines } = await supabase
        .from('chunks')
        .select('id')
        .eq('is_system', false)
        .in('scene_id', sceneIds);

      const lineIds = (performableLines ?? []).map((line) => line.id);

      if (lineIds.length > 0) {
        const { data: recs } = await supabase
          .from('recordings')
          .select('chunk_id')
          .in('chunk_id', lineIds);

        recordedLines = new Set((recs ?? []).map((r) => r.chunk_id)).size;
      }
    }

    stats.push({
      ...script,
      recorded_lines: recordedLines,
      completion: totalPerformable > 0
        ? Math.round((recordedLines / totalPerformable) * 100)
        : 0,
    });
  }

  return NextResponse.json(stats);
}

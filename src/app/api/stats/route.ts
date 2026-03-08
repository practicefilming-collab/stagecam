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

  // For each script, get scene IDs via acts, then count recorded chunks
  const stats = [];
  for (const script of scripts) {
    const { data: acts } = await supabase
      .from('acts')
      .select('scenes(id, performable_chunks)')
      .eq('script_id', script.id);

    const scenes = (acts ?? []).flatMap(
      (a) => (a.scenes ?? []) as { id: string; performable_chunks: number }[]
    );
    const sceneIds = scenes.map((s) => s.id);
    const totalPerformable = scenes.reduce((sum, s) => sum + (s.performable_chunks ?? 0), 0);

    let recordedChunks = 0;
    if (sceneIds.length > 0) {
      // Get performable chunk IDs for these scenes
      const { data: perfChunks } = await supabase
        .from('chunks')
        .select('id')
        .eq('is_system', false)
        .in('scene_id', sceneIds);

      const chunkIds = (perfChunks ?? []).map((c) => c.id);

      if (chunkIds.length > 0) {
        const { data: recs } = await supabase
          .from('recordings')
          .select('chunk_id')
          .in('chunk_id', chunkIds);

        recordedChunks = new Set((recs ?? []).map((r) => r.chunk_id)).size;
      }
    }

    stats.push({
      ...script,
      recorded_chunks: recordedChunks,
      completion: totalPerformable > 0
        ? Math.round((recordedChunks / totalPerformable) * 100)
        : 0,
    });
  }

  return NextResponse.json(stats);
}

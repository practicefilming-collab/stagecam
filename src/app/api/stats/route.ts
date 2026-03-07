import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scriptId = searchParams.get('script_id');

  if (!scriptId) {
    // Return all scripts with completion stats
    const { data: scripts } = await supabase
      .from('scripts')
      .select('*')
      .order('rank');

    const stats = [];
    for (const script of scripts ?? []) {
      const { count: recordedChunks } = await supabase
        .from('recordings')
        .select('chunk_id', { count: 'exact', head: true })
        .eq('chunks.scene_id', script.id);

      stats.push({
        ...script,
        recorded_chunks: recordedChunks ?? 0,
        completion: script.total_chunks > 0
          ? Math.round(((recordedChunks ?? 0) / script.total_chunks) * 100)
          : 0,
      });
    }

    return NextResponse.json(stats);
  }

  // Detailed stats for a specific script
  const { data: acts } = await supabase
    .from('acts')
    .select('*, scenes(*)')
    .eq('script_id', scriptId)
    .order('act_number');

  return NextResponse.json(acts ?? []);
}

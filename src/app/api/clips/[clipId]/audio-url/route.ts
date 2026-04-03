import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getPresignedUrl } from '@/lib/clips/pipeline/storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: clip } = await supabase
    .from('clips')
    .select('audio_aac_path, duration_ms')
    .eq('id', clipId)
    .single();

  if (!clip?.audio_aac_path) {
    return NextResponse.json({ error: 'Audio not available' }, { status: 404 });
  }

  const url = await getPresignedUrl(clip.audio_aac_path, 600);
  return NextResponse.json({ url, duration_ms: clip.duration_ms });
}

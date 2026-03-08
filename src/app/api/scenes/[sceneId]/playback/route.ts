import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { buildScenePlaybackData } from '@/lib/player/build-scene-playback';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const playback = await buildScenePlaybackData(supabase, sceneId);
  if (!playback) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
  }

  return NextResponse.json(playback);
}

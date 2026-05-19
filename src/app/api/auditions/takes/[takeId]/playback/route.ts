import { NextResponse } from 'next/server';
import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { buildAuditionTakePlaybackData } from '@/lib/auditions/build-take-playback';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ takeId: string }> },
) {
  const { takeId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const playback = await buildAuditionTakePlaybackData(takeId);
  if (!playback) {
    return NextResponse.json({ error: 'Take not found' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: script } = await admin
    .from('audition_scripts')
    .select('id, assigned_rehearser_user_id')
    .eq('id', playback.script.id)
    .single();

  const access = await getAuditionScriptAccessContext({
    viewer,
    script: {
      id: playback.script.id,
      assigned_rehearser_user_id: script?.assigned_rehearser_user_id ?? '',
    },
  });

  if (!access.canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(playback);
}

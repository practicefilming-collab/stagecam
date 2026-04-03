import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const segmentId = searchParams.get('segment_id');

  let query = supabase
    .from('clip_attempts')
    .select('*')
    .eq('clip_id', clipId)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false });

  if (segmentId) {
    query = query.eq('segment_id', segmentId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  if (!body.segment_id) {
    return NextResponse.json({ error: 'segment_id is required' }, { status: 400 });
  }

  if (!body.practice_mode) {
    return NextResponse.json({ error: 'practice_mode is required' }, { status: 400 });
  }

  if (!body.speed_level) {
    return NextResponse.json({ error: 'speed_level is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clip_attempts')
    .insert({
      user_id: user.id,
      clip_id: clipId,
      segment_id: body.segment_id,
      practice_mode: body.practice_mode,
      speed_level: body.speed_level,
      playback_treatment: body.playback_treatment ?? 'pitch_shifted',
      capture_isolation_type: body.capture_isolation_type ?? 'mixed',
      pairing_status: body.pairing_status ?? 'not_needed',
      headphone_required_met: body.headphone_required_met ?? false,
      visualization_active: body.visualization_active ?? true,
      recording_path: body.recording_path ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

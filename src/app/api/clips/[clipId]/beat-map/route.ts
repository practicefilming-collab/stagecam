import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';

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
    .select('beat_map_path')
    .eq('id', clipId)
    .single();

  if (!clip?.beat_map_path) {
    return NextResponse.json({ bpm: 120, beat_times_ms: [], beat_strengths: [] });
  }

  try {
    const response = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: clip.beat_map_path }),
    );
    const body = await response.Body?.transformToString();
    if (!body) {
      return NextResponse.json({ bpm: 120, beat_times_ms: [], beat_strengths: [] });
    }
    return NextResponse.json(JSON.parse(body));
  } catch {
    return NextResponse.json({ bpm: 120, beat_times_ms: [], beat_strengths: [] });
  }
}

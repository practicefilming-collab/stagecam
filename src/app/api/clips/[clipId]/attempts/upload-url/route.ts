import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

  const { attemptId, ext } = await request.json();
  if (!attemptId || !ext) {
    return NextResponse.json({ error: 'attemptId and ext are required' }, { status: 400 });
  }

  const key = `clips/attempts/${clipId}/${attemptId}.${ext}`;
  const contentType = ext === 'webm' ? 'video/webm' : ext === 'mp4' ? 'video/mp4' : 'application/octet-stream';

  const url = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  return NextResponse.json({ url, key, contentType });
}

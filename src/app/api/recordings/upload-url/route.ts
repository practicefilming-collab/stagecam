import { createClient } from '@/lib/supabase/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { scriptId, chunkId, ext } = await request.json();

  if (!scriptId || !chunkId || !ext) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const timestamp = Date.now();
  const key = `${scriptId}/${chunkId}/${user.id}_${timestamp}.${ext}`;
  const contentType = ext === 'mp4' ? 'video/mp4' : 'video/webm';

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(r2, command, { expiresIn: 300 });

  return NextResponse.json({ url, key, contentType });
}

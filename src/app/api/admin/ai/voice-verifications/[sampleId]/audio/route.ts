import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { r2, R2_BUCKET } from '@/lib/r2';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sampleId: string }> }
) {
  const { sampleId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ai_voice_verification_samples')
    .select('storage_key')
    .eq('id', sampleId)
    .single();

  if (error || !data?.storage_key) {
    return NextResponse.json({ error: error?.message ?? 'Voice verification sample not found' }, { status: 404 });
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: data.storage_key,
  });
  const signedUrl = await getSignedUrl(r2, command, { expiresIn: 600 });

  return NextResponse.redirect(signedUrl, { status: 307 });
}

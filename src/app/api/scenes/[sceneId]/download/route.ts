import { createClient } from '@/lib/supabase/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

async function triggerProcessing(request: Request, jobId: string) {
  const processUrl = new URL('/api/exports/process', request.url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.EXPORT_WORKER_TOKEN) {
    headers['x-export-worker-token'] = process.env.EXPORT_WORKER_TOKEN;
  }

  await fetch(processUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId }),
  }).catch(() => {});
}

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

  const { data: latest } = await supabase
    .from('scene_export_jobs')
    .select('*')
    .eq('scene_id', sceneId)
    .eq('requested_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.status === 'succeeded' && latest.output_r2_key && latest.output_expires_at && new Date(latest.output_expires_at) > new Date()) {
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: latest.output_r2_key });
    const signed = await getSignedUrl(r2, cmd, { expiresIn: 600 });
    return NextResponse.redirect(signed, 302);
  }

  let jobId = latest?.id as string | undefined;

  if (!latest || !['queued', 'processing'].includes(latest.status)) {
    const { data: created, error } = await supabase
      .from('scene_export_jobs')
      .insert({
        scene_id: sceneId,
        requested_by: user.id,
        status: 'queued',
        progress_pct: 0,
      })
      .select('*')
      .single();

    if (error || !created) {
      return NextResponse.json({ error: error?.message || 'Failed to create export job' }, { status: 500 });
    }
    jobId = created.id;
  }

  if (jobId) {
    void triggerProcessing(request, jobId);
  }

  return NextResponse.json(
    {
      status: 'queued',
      jobId: jobId ?? latest?.id,
      message: 'Export queued. Poll /api/exports/{jobId} for status.',
    },
    { status: 202, headers: { 'X-Export-Async': '1' } }
  );
}


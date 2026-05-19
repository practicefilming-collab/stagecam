import { createClient } from '@/lib/supabase/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: job } = await supabase
    .from('audition_replay_export_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('requested_by', user.id)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  let status = job.status as 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired';
  let downloadUrl: string | null = null;

  if (status === 'succeeded') {
    const expired = !job.output_expires_at || new Date(job.output_expires_at) <= new Date();
    if (expired) {
      status = 'expired';
    } else if (job.output_r2_key) {
      const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: job.output_r2_key });
      downloadUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });
    }
  }

  return NextResponse.json({
    jobId: job.id,
    takeId: job.audition_take_id,
    status,
    progressPct: job.progress_pct ?? 0,
    errorMessage: job.error_message ?? null,
    expiresAt: job.output_expires_at ?? null,
    downloadUrl,
  });
}

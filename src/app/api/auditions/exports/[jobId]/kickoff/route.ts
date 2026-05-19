import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
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

  if (job.status === 'processing' || job.status === 'succeeded') {
    return NextResponse.json({ status: job.status });
  }

  const processUrl = new URL('/api/auditions/exports/process', request.url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.EXPORT_WORKER_TOKEN) {
    headers['x-export-worker-token'] = process.env.EXPORT_WORKER_TOKEN;
  }

  void fetch(processUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId }),
  }).catch(() => {});

  return NextResponse.json({ status: 'queued' }, { status: 202 });
}

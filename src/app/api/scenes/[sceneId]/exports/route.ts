import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function kickoff(request: Request, jobId: string) {
  const url = new URL('/api/exports/process', request.url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.EXPORT_WORKER_TOKEN) {
    headers['x-export-worker-token'] = process.env.EXPORT_WORKER_TOKEN;
  }

  await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId }),
  }).catch(() => {
    // Best-effort trigger; polling endpoint can re-kick via kickoff route.
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from('scene_export_jobs')
    .select('*')
    .eq('scene_id', sceneId)
    .eq('requested_by', user.id)
    .in('status', ['queued', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ jobId: existing.id, status: existing.status }, { status: 202 });
  }

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

  void kickoff(request, created.id);
  return NextResponse.json({ jobId: created.id, status: 'queued' }, { status: 202 });
}


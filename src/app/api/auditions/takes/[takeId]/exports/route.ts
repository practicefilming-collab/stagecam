import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionTakeDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function kickoff(request: Request, jobId: string) {
  const url = new URL('/api/auditions/exports/process', request.url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.EXPORT_WORKER_TOKEN) {
    headers['x-export-worker-token'] = process.env.EXPORT_WORKER_TOKEN;
  }

  await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId }),
  }).catch(() => {
    // Best-effort trigger; polling can re-kick later.
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ takeId: string }> },
) {
  const { takeId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const detail = await getAuditionTakeDetail(takeId);
  if (!detail) {
    return NextResponse.json({ error: 'Rehearsal not found' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: script } = await admin
    .from('audition_scripts')
    .select('id, assigned_rehearser_user_id')
    .eq('id', detail.audition_script_id)
    .single();

  const access = await getAuditionScriptAccessContext({
    viewer,
    script: {
      id: detail.audition_script_id,
      assigned_rehearser_user_id: script?.assigned_rehearser_user_id ?? '',
    },
  });
  if (!access.canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('audition_replay_export_jobs')
    .select('*')
    .eq('audition_take_id', takeId)
    .eq('requested_by', viewer.userId)
    .in('status', ['queued', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ jobId: existing.id, status: existing.status }, { status: 202 });
  }

  const { data: created, error } = await supabase
    .from('audition_replay_export_jobs')
    .insert({
      audition_take_id: takeId,
      requested_by: viewer.userId,
      status: 'queued',
      progress_pct: 0,
    })
    .select('*')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || 'Failed to create replay export job' }, { status: 500 });
  }

  void kickoff(request, created.id);
  return NextResponse.json({ jobId: created.id, status: 'queued' }, { status: 202 });
}

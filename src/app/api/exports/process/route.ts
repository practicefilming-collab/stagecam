import { createAdminClient } from '@/lib/supabase/admin';
import { r2, R2_BUCKET } from '@/lib/r2';
import { buildScenePlaybackData } from '@/lib/player/build-scene-playback';
import { hasExportBinaries, renderSceneExportToFile } from '@/lib/export/scene-export-renderer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const EXPORT_TTL_HOURS = 24;

function expiresAtIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

export async function POST(request: Request) {
  const workerToken = process.env.EXPORT_WORKER_TOKEN;
  const incomingToken = request.headers.get('x-export-worker-token');
  if (workerToken && incomingToken !== workerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await request.json().catch(() => ({} as { jobId?: string }));
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('scene_export_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.status === 'succeeded' && job.output_r2_key && job.output_expires_at && new Date(job.output_expires_at) > new Date()) {
    return NextResponse.json({ status: 'succeeded' });
  }

  const { data: claimed, error: claimError } = await admin
    .from('scene_export_jobs')
    .update({
      status: 'processing',
      progress_pct: 1,
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId)
    .in('status', ['queued', 'failed'])
    .select('*')
    .single();

  if (claimError || !claimed) {
    return NextResponse.json({ status: job.status });
  }

  let tmpRoot: string | null = null;
  try {
    const binariesOk = await hasExportBinaries();
    if (!binariesOk) {
      throw new Error('Export binaries unavailable');
    }

    const playback = await buildScenePlaybackData(admin, claimed.scene_id);
    if (!playback) {
      throw new Error('Scene playback data unavailable');
    }

    const render = await renderSceneExportToFile(playback, async (pct) => {
      await admin.from('scene_export_jobs').update({ progress_pct: pct }).eq('id', claimed.id);
    });
    tmpRoot = render.tmpRoot;

    const key = `exports/${claimed.scene_id}/${claimed.id}.mp4`;
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: createReadStream(render.outputPath),
        ContentType: 'video/mp4',
      })
    );

    await admin
      .from('scene_export_jobs')
      .update({
        status: 'succeeded',
        progress_pct: 100,
        output_r2_key: key,
        output_expires_at: expiresAtIso(EXPORT_TTL_HOURS),
        finished_at: new Date().toISOString(),
      })
      .eq('id', claimed.id);

    return NextResponse.json({ status: 'succeeded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    await admin
      .from('scene_export_jobs')
      .update({
        status: 'failed',
        error_message: message.slice(0, 900),
        finished_at: new Date().toISOString(),
      })
      .eq('id', claimed.id);
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  } finally {
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  }
}

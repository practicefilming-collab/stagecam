import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { detectPlatform } from '@/lib/clips';

/**
 * POST: Extract metadata from a TikTok URL via the Fly.io worker.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { url } = await request.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const workerUrl = process.env.CLIP_WORKER_URL;
  const workerToken = process.env.CLIP_WORKER_TOKEN;

  if (!workerUrl) {
    // No worker configured — return empty metadata for manual entry
    return NextResponse.json({
      error: 'Clip worker not configured',
      display_title: '',
      creator_name: '',
      creator_handle: '',
      duration_ms: 0,
      description: '',
      source_platform: detectPlatform(url),
      source_url: url.trim(),
    });
  }

  try {
    const res = await fetch(`${workerUrl}/metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerToken ? { 'x-worker-token': workerToken } : {}),
      },
      body: JSON.stringify({ url: url.trim() }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({
      error: `Worker request failed: ${(err as Error).message}`,
      display_title: '',
      creator_name: '',
      creator_handle: '',
      duration_ms: 0,
      description: '',
      source_platform: detectPlatform(url),
      source_url: url.trim(),
    });
  }
}

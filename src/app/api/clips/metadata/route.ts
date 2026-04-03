import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { detectPlatform } from '@/lib/clips';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST: Extract metadata from a TikTok/short-form video URL without downloading.
 * Uses yt-dlp --dump-json to get title, creator, duration, description.
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

  try {
    const { default: ytDlp } = await import('yt-dlp-exec');

    const result = await ytDlp(url.trim(), {
      dumpSingleJson: true,
      noCheckCertificate: true,
      noWarnings: true,
      skipDownload: true,
    });

    // yt-dlp returns the JSON as stdout parsed into an object
    const info = result as Record<string, unknown>;

    const platform = detectPlatform(url);
    const title = (info.title as string) ?? (info.fulltitle as string) ?? '';
    const creator = (info.creator as string) ?? (info.uploader as string) ?? (info.channel as string) ?? '';
    const creatorHandle = (info.uploader_id as string) ?? (info.channel_id as string) ?? '';
    const durationSeconds = (info.duration as number) ?? 0;
    const description = (info.description as string) ?? '';

    return NextResponse.json({
      display_title: title,
      creator_name: creator,
      creator_handle: creatorHandle ? `@${creatorHandle.replace(/^@/, '')}` : '',
      duration_ms: Math.round(durationSeconds * 1000),
      description,
      source_platform: platform,
      source_url: url.trim(),
    });
  } catch (err) {
    return NextResponse.json({
      error: `Failed to extract metadata: ${(err as Error).message}`,
      // Return partial data so the form still works
      display_title: '',
      creator_name: '',
      creator_handle: '',
      duration_ms: 0,
      description: '',
      source_platform: detectPlatform(url),
      source_url: url.trim(),
    }, { status: 200 }); // 200 so the form can still proceed with manual entry
  }
}

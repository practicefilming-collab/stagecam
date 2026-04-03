import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type RouteContext = { params: Promise<{ profileId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const scriptId = url.searchParams.get('scriptId');
  const character = url.searchParams.get('character');
  const limitParam = Number(url.searchParams.get('limit') ?? '40');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 40;

  const admin = createAdminClient();

  let query = admin
    .from('recordings')
    .select(`
      id,
      created_at,
      video_url,
      format,
      chunks!inner(
        id,
        type,
        character,
        chunk_in_scene,
        chunk_text,
        scenes!inner(
          id,
          scene_number,
          scene_heading,
          acts!inner(
            act_number,
            script_id,
            scripts!inner(id, title, year, slug)
          )
        )
      )
    `)
    .eq('ai_profile_id', profileId)
    .eq('recording_source', 'ai_generated')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (scriptId) {
    query = query.eq('chunks.scenes.acts.script_id', scriptId);
  }

  if (character === '__narrator__') {
    query = query.is('chunks.character', null);
  } else if (character) {
    query = query.eq('chunks.character', character);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message ?? 'Failed to load AI recordings' }, { status: 500 });
  }

  const recordings = (data ?? []).map((rec) => {
    const chunkJoin = rec.chunks as unknown as {
      id: string;
      type: string;
      character: string | null;
      chunk_in_scene: number;
      chunk_text: string;
      scenes: {
        id: string;
        scene_number: number;
        scene_heading: string | null;
        acts: {
          act_number: number;
          script_id: string;
          scripts: {
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          };
        } | Array<{
          act_number: number;
          script_id: string;
          scripts: {
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          } | Array<{
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          }>;
        }>;
      } | Array<{
        id: string;
        scene_number: number;
        scene_heading: string | null;
        acts: {
          act_number: number;
          script_id: string;
          scripts: {
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          } | Array<{
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          }>;
        } | Array<{
          act_number: number;
          script_id: string;
          scripts: {
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          } | Array<{
            id: string;
            title: string;
            year: number | null;
            slug: string | null;
          }>;
        }>;
      }>;
    };
    const scene = Array.isArray(chunkJoin.scenes) ? chunkJoin.scenes[0] : chunkJoin.scenes;
    const act = Array.isArray(scene.acts) ? scene.acts[0] : scene.acts;
    const script = Array.isArray(act.scripts) ? act.scripts[0] : act.scripts;

    return {
      recordingId: rec.id,
      lineId: chunkJoin.id,
      type: chunkJoin.type,
      character: chunkJoin.character,
      lineInScene: chunkJoin.chunk_in_scene,
      lineText: chunkJoin.chunk_text,
      createdAt: rec.created_at,
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      sceneHeading: scene.scene_heading,
      actNumber: act.act_number,
      scriptId: act.script_id,
      scriptTitle: script.title,
      scriptYear: script.year,
      scriptSlug: script.slug,
      recordingUrl: null as string | null,
      recordingFormat: rec.format ?? null,
    };
  });

  for (const recording of recordings) {
    const source = (data ?? []).find((entry) => entry.id === recording.recordingId);
    const storageKey = source?.video_url;
    if (!storageKey) continue;

    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: storageKey,
      });
      recording.recordingUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    } catch {
      recording.recordingUrl = null;
    }
  }

  return NextResponse.json({ recordings });
}

import { createClient } from '@/lib/supabase/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { normalizeScriptText } from '@/lib/utils';

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

  // Get scene info
  const { data: scene } = await supabase
    .from('scenes')
    .select('*, acts(act_number, script_id, scripts(title, year, storage_prefix))')
    .eq('id', sceneId)
    .single();

  if (!scene) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
  }

  // Get all chunks in order
  const { data: chunks } = await supabase
    .from('chunks')
    .select('*')
    .eq('scene_id', sceneId)
    .order('chunk_in_scene');

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ error: 'No chunks' }, { status: 400 });
  }

  // Get all recordings for these chunks (latest per chunk)
  const chunkIds = chunks.map((c) => c.id);
  const { data: recordings } = await supabase
    .from('recordings')
    .select('*, profiles(display_name)')
    .in('chunk_id', chunkIds)
    .order('created_at', { ascending: false });

  // Get assignments for this scene's room to determine original vs cover
  const { data: roomParticipants } = await supabase
    .from('room_participants')
    .select('user_id, assigned_chunks')
    .eq('room_id', recordings?.[0]?.room_id ?? '');

  // Build chunk_id -> assigned user_id map
  const chunkAssignmentMap = new Map<string, string>();
  for (const rp of roomParticipants ?? []) {
    const assigned = (rp.assigned_chunks ?? []) as { chunk_id: string }[];
    for (const a of assigned) {
      chunkAssignmentMap.set(a.chunk_id, rp.user_id);
    }
  }

  // Build a map: chunk_id -> latest recording
  const recs = recordings ?? [];
  const recordingMap = new Map<string, (typeof recs)[0]>();
  for (const rec of recs) {
    if (!recordingMap.has(rec.chunk_id)) {
      recordingMap.set(rec.chunk_id, rec);
    }
  }

  // Generate signed URLs for recordings in R2
  const r2SignedUrls = new Map<string, string>();
  for (const [chunkId, rec] of recordingMap) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: rec.video_url,
      });
      const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
      r2SignedUrls.set(chunkId, url);
    } catch {
      // Skip if can't sign
    }
  }

  // Build TTS audio public URLs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // Build playback items
  const items = chunks.map((chunk) => {
    const recording = recordingMap.get(chunk.id);
    const r2Url = r2SignedUrls.get(chunk.id);

    const ttsUrl = chunk.tts_audio_url
      ? `${supabaseUrl}/storage/v1/object/public/tts-audio/${chunk.tts_audio_url}`
      : null;

    return {
      chunkId: chunk.id,
      chunkIndex: chunk.chunk_index,
      chunkInScene: chunk.chunk_in_scene,
      type: chunk.type,
      character: chunk.character,
      isSystem: chunk.is_system ?? false,
      text: chunk.tts_text ?? normalizeScriptText(chunk.chunk_text),
      // Recording data (if exists)
      hasRecording: !!recording,
      recordingUrl: r2Url ?? null,
      recordingFormat: recording?.format ?? null,
      performerName: recording
        ? (recording.profiles as unknown as { display_name: string })?.display_name
        : null,
      fallbackSource: recording
        ? (chunkAssignmentMap.get(chunk.id) === recording.user_id ? 'performer' : 'cover')
        : chunk.tts_audio_url ? 'tts' : 'text',
      // TTS fallback
      ttsUrl,
    };
  });

  const act = scene.acts as unknown as {
    act_number: number;
    script_id: string;
    scripts: { title: string; year: number; storage_prefix: string };
  };

  return NextResponse.json({
    scene: {
      id: scene.id,
      sceneNumber: scene.scene_number,
      sceneHeading: scene.scene_heading,
      actNumber: act.act_number,
      scriptTitle: act.scripts.title,
      scriptYear: act.scripts.year,
    },
    items,
    stats: {
      totalChunks: chunks.length,
      performableChunks: chunks.filter((c) => !c.is_system).length,
      recordedChunks: recordingMap.size,
      ttsChunks: chunks.length - recordingMap.size,
      systemChunks: chunks.filter((c) => c.is_system).length,
    },
  });
}

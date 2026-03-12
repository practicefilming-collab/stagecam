import { getLineText } from '@/lib/line-helpers';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PlaybackItem {
  lineId: string;
  lineIndex: number;
  lineInScene: number;
  type: string;
  character: string | null;
  isSystem: boolean;
  text: string;
  hasRecording: boolean;
  recordingUrl: string | null;
  recordingFormat: string | null;
  performerName: string | null;
  fallbackSource: 'performer' | 'cover' | 'tts' | 'text';
  ttsUrl: string | null;
}

export interface ScenePlaybackData {
  scene: {
    id: string;
    sceneNumber: number;
    sceneHeading: string;
    actNumber: number;
    scriptTitle: string;
    scriptYear: number;
  };
  items: PlaybackItem[];
  stats: {
    totalLines: number;
    rehearsableLines: number;
    recordedLines: number;
    ttsLines: number;
    systemLines: number;
  };
}

export async function buildScenePlaybackData(
  supabase: SupabaseClient,
  sceneId: string
): Promise<ScenePlaybackData | null> {
  const { data: scene } = await supabase
    .from('scenes')
    .select('*, acts(act_number, script_id, scripts(title, year, storage_prefix))')
    .eq('id', sceneId)
    .single();

  if (!scene) return null;

  const { data: dbLines } = await supabase
    .from('chunks')
    .select('*')
    .eq('scene_id', sceneId)
    .order('chunk_in_scene');

  const lineRows = (dbLines ?? []) as Array<{
    id: string;
    chunk_index: number;
    chunk_in_scene: number;
    type: string;
    character: string | null;
    is_system: boolean | null;
    tts_text: string | null;
    chunk_text: string;
    tts_audio_url: string | null;
  }>;

  if (lineRows.length === 0) return null;

  const lineIds = lineRows.map((line) => line.id);
  const { data: recordings } = await supabase
    .from('recordings')
    .select('*, profiles(display_name)')
    .in('chunk_id', lineIds)
    .order('created_at', { ascending: false });

  const recordingRows = (recordings ?? []) as Array<{
    chunk_id: string;
    user_id: string;
    room_id: string | null;
    video_url: string;
    format: string | null;
    profiles: { display_name: string } | null;
  }>;

  const { data: roomParticipants } = await supabase
    .from('room_participants')
    .select('user_id, assigned_chunks')
    .eq('room_id', recordingRows[0]?.room_id ?? '');

  const lineAssignmentMap = new Map<string, string>();
  for (const rp of (roomParticipants ?? []) as Array<{ user_id: string; assigned_chunks: { chunk_id?: string; line_id?: string }[] | null }>) {
    const assigned = rp.assigned_chunks ?? [];
    for (const a of assigned) {
      const id = a.line_id ?? a.chunk_id;
      if (id) lineAssignmentMap.set(id, rp.user_id);
    }
  }

  const recordingMap = new Map<string, (typeof recordingRows)[0]>();
  for (const rec of recordingRows) {
    if (!recordingMap.has(rec.chunk_id)) {
      recordingMap.set(rec.chunk_id, rec);
    }
  }

  const r2SignedUrls = new Map<string, string>();
  for (const [lineId, rec] of recordingMap) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: rec.video_url,
      });
      const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
      r2SignedUrls.set(lineId, url);
    } catch {
      // Skip if cannot sign
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const items: PlaybackItem[] = lineRows.map((line) => {
    const recording = recordingMap.get(line.id);
    const r2Url = r2SignedUrls.get(line.id);
    const ttsUrl = line.tts_audio_url
      ? `${supabaseUrl}/storage/v1/object/public/tts-audio/${line.tts_audio_url}`
      : null;

    return {
      lineId: line.id,
      lineIndex: line.chunk_index,
      lineInScene: line.chunk_in_scene,
      type: line.type,
      character: line.character,
      isSystem: line.is_system ?? false,
      text: getLineText(line),
      hasRecording: !!recording,
      recordingUrl: r2Url ?? null,
      recordingFormat: recording?.format ?? null,
      performerName: recording?.profiles?.display_name ?? null,
      fallbackSource: recording
        ? (lineAssignmentMap.get(line.id) === recording.user_id ? 'performer' : 'cover')
        : line.tts_audio_url ? 'tts' : 'text',
      ttsUrl,
    };
  });

  const act = (scene as {
    id: string;
    scene_number: number;
    scene_heading: string | null;
    acts: { act_number: number; scripts: { title: string; year: number } } | null;
  }).acts;

  return {
    scene: {
      id: (scene as { id: string }).id,
      sceneNumber: (scene as { scene_number: number }).scene_number,
      sceneHeading: (scene as { scene_heading: string | null }).scene_heading ?? 'Untitled',
      actNumber: act?.act_number ?? 0,
      scriptTitle: act?.scripts?.title ?? 'scene',
      scriptYear: act?.scripts?.year ?? 0,
    },
    items,
    stats: {
      totalLines: lineRows.length,
      rehearsableLines: lineRows.filter((line) => !line.is_system).length,
      recordedLines: recordingMap.size,
      ttsLines: lineRows.length - recordingMap.size,
      systemLines: lineRows.filter((line) => line.is_system).length,
    },
  };
}

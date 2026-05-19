import { createAdminClient } from '@/lib/supabase/admin';
import type {
  AuditionScript,
  AuditionTake,
  AuditionTakeClip,
  AuditionTakeRoleAssignment,
  Script,
} from '@/lib/types';
import { AUDITION_STORAGE_BUCKET } from './constants';
import { buildAuditionSharedAudioUrlMap } from './level1-audio';
import { parseAuditionSceneRuntimeLines } from './scene-runtime';

export interface AuditionTakePlaybackItem {
  lineId: string;
  lineIndex: number;
  lineInScene: number;
  type: 'dialogue' | 'cue';
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

export interface AuditionTakePlaybackData {
  take: Pick<AuditionTake, 'id' | 'title' | 'status' | 'created_at' | 'completed_at'>;
  scene: {
    id: string;
    label: string;
    orderIndex: number;
    sourcePageRef: string | null;
  };
  script: {
    id: string;
    title: string;
  };
  items: AuditionTakePlaybackItem[];
  stats: {
    totalLines: number;
    rehearsableLines: number;
    recordedLines: number;
    ttsLines: number;
    systemLines: number;
  };
}

export async function buildAuditionTakePlaybackData(takeId: string): Promise<AuditionTakePlaybackData | null> {
  const admin = createAdminClient();
  const { data: take } = await admin
    .from('audition_takes')
    .select('*')
    .eq('id', takeId)
    .maybeSingle();

  if (!take) return null;

  const [{ data: scene }, { data: script }, { data: assignments }, { data: clips }, { data: linkedScript }] = await Promise.all([
    admin
      .from('audition_scenes')
      .select('id, label, order_index, source_page_ref, scene_text')
      .eq('id', take.audition_scene_id)
      .maybeSingle(),
    admin
      .from('audition_scripts')
      .select('id, title, processing_notes')
      .eq('id', take.audition_script_id)
      .maybeSingle(),
    admin
      .from('audition_take_role_assignments')
      .select('*')
      .eq('take_id', takeId),
    admin
      .from('audition_take_clips')
      .select('*, profiles(display_name)')
      .eq('take_id', takeId)
      .order('sequence_index')
      .order('created_at', { ascending: false }),
    admin
      .from('scripts')
      .select('id')
      .eq('source_audition_script_id', take.audition_script_id)
      .maybeSingle(),
  ]);

  if (!scene || !script) return null;

  const runtimeLines = parseAuditionSceneRuntimeLines(scene.scene_text);
  const latestClipBySequence = new Map<number, AuditionTakeClip & { profiles?: { display_name: string } | null }>();
  for (const clip of ((clips ?? []) as Array<AuditionTakeClip & { profiles?: { display_name: string } | null }>)) {
    if (!latestClipBySequence.has(clip.sequence_index)) {
      latestClipBySequence.set(clip.sequence_index, clip);
    }
  }

  const assignmentByRole = new Map<string, AuditionTakeRoleAssignment>();
  for (const assignment of (assignments ?? []) as AuditionTakeRoleAssignment[]) {
    assignmentByRole.set(assignment.role_name, assignment);
  }

  const signedUrls = new Map<number, string | null>();
  for (const [sequenceIndex, clip] of latestClipBySequence.entries()) {
    const { data } = await admin.storage
      .from(AUDITION_STORAGE_BUCKET)
      .createSignedUrl(clip.storage_key, 60 * 60);
    signedUrls.set(sequenceIndex, data?.signedUrl ?? null);
  }
  const level1SignedUrls = await buildAuditionSharedAudioUrlMap({
    admin,
    audition: script as Pick<AuditionScript, 'id' | 'processing_notes'>,
    linkedScriptId: (linkedScript as Pick<Script, 'id'> | null)?.id ?? null,
    auditionScene: {
      ...scene,
      audition_script_id: take.audition_script_id,
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  });

  const items: AuditionTakePlaybackItem[] = runtimeLines.map((line) => {
    const clip = latestClipBySequence.get(line.sequenceIndex);
    const assignment = line.roleName ? assignmentByRole.get(line.roleName) : null;
    const recordedByAssignedUser = Boolean(
      clip && assignment && assignment.assignment_type === 'human' && assignment.user_id && assignment.user_id === clip.actor_user_id,
    );

    return {
      lineId: `${takeId}:${line.sequenceIndex}`,
      lineIndex: line.sequenceIndex,
      lineInScene: line.sequenceIndex + 1,
      type: line.kind,
      character: line.roleName,
      isSystem: line.kind === 'cue',
      text: line.text,
      hasRecording: Boolean(clip),
      recordingUrl: clip ? signedUrls.get(line.sequenceIndex) ?? null : null,
      recordingFormat: clip?.content_type ?? null,
      performerName: clip?.profiles?.display_name ?? null,
      fallbackSource: clip
        ? (recordedByAssignedUser ? 'performer' : 'cover')
        : level1SignedUrls.get(line.sequenceIndex)
          ? 'tts'
          : 'text',
      ttsUrl: level1SignedUrls.get(line.sequenceIndex) ?? null,
    };
  });

  return {
    take: {
      id: take.id,
      title: take.title,
      status: take.status,
      created_at: take.created_at,
      completed_at: take.completed_at,
    },
    scene: {
      id: scene.id,
      label: scene.label,
      orderIndex: scene.order_index,
      sourcePageRef: scene.source_page_ref,
    },
    script: {
      id: script.id,
      title: script.title,
    },
    items,
    stats: {
      totalLines: items.length,
      rehearsableLines: items.filter((item) => !item.isSystem).length,
      recordedLines: items.filter((item) => item.hasRecording).length,
      ttsLines: items.filter((item) => item.fallbackSource === 'tts').length,
      systemLines: items.filter((item) => item.isSystem).length,
    },
  };
}

import { randomUUID } from 'crypto';
import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { AUDITION_STORAGE_BUCKET } from '@/lib/auditions/constants';
import { getAuditionTakeDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeStorageFilename } from '@/lib/auditions/files';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function inferExtension(fileName: string, contentType: string) {
  if (fileName.includes('.')) return fileName.split('.').pop() ?? 'webm';
  if (contentType.includes('mp4')) return 'mp4';
  return 'webm';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ takeId: string }> },
) {
  const { takeId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const detail = await getAuditionTakeDetail(takeId);
  if (!detail) return NextResponse.json({ error: 'Take not found' }, { status: 404 });

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

  const formData = await request.formData();
  const file = formData.get('file');
  const roleName = String(formData.get('role_name') ?? '').trim();
  const lineText = String(formData.get('line_text') ?? '').trim();
  const sequenceIndex = Number(formData.get('sequence_index') ?? -1);
  const durationSeconds = Number(formData.get('duration_seconds') ?? 0);

  if (!(file instanceof File) || !roleName || !lineText || Number.isNaN(sequenceIndex) || sequenceIndex < 0) {
    return NextResponse.json({ error: 'file, role_name, line_text, and sequence_index are required' }, { status: 400 });
  }

  const assignedRoles = new Set(
    detail.assignments
      .filter((assignment) => assignment.user_id === viewer.userId && assignment.assignment_type === 'human')
      .map((assignment) => assignment.role_name),
  );
  if (!assignedRoles.has(roleName) && access.viewerRole !== 'admin') {
    return NextResponse.json({ error: 'You are not assigned to record this role in the take' }, { status: 403 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = inferExtension(file.name, file.type);
  const clipId = randomUUID();
  const storageKey = `takes/${detail.audition_script_id}/${takeId}/${viewer.userId}/${sequenceIndex}-${clipId}.${sanitizeStorageFilename(ext)}`;
  const upload = await admin.storage
    .from(AUDITION_STORAGE_BUCKET)
    .upload(storageKey, bytes, {
      contentType: file.type || 'video/webm',
      upsert: true,
    });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: clip, error } = await admin
    .from('audition_take_clips')
    .insert({
      take_id: takeId,
      audition_scene_id: detail.audition_scene_id,
      room_session_id: detail.room_session_id,
      actor_user_id: viewer.userId,
      role_name: roleName,
      sequence_index: sequenceIndex,
      line_text: lineText,
      storage_key: storageKey,
      content_type: file.type || 'video/webm',
      duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      byte_length: bytes.byteLength,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(clip, { status: 201 });
}

import { canAccessAuditionsMode, getAuditionViewerContext, syncAdminAuditionRelationships } from '@/lib/auditions/auth';
import { isAllowedAuditionFile, sanitizeStorageFilename } from '@/lib/auditions/files';
import { AUDITION_STORAGE_BUCKET } from '@/lib/auditions/constants';
import { listAuditionScriptsForViewer } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canAccessAuditionsMode(viewer.profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scripts = await listAuditionScriptsForViewer(viewer);
  return NextResponse.json(scripts);
}

export async function POST(request: Request) {
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canAccessAuditionsMode(viewer.profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  const sourceLabel = String(formData.get('source_label') ?? '').trim();
  const assignedRehearserUserIdRaw = String(formData.get('assigned_rehearser_user_id') ?? '').trim();
  const file = formData.get('file');

  if (!title || !sourceLabel) {
    return NextResponse.json({ error: 'Title and source label are required' }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }

  if (!isAllowedAuditionFile(file)) {
    return NextResponse.json({ error: 'Only PDF, DOCX, and TXT files are allowed' }, { status: 400 });
  }

  const admin = createAdminClient();
  const assignedRehearserUserId = viewer.profile.is_admin
    ? assignedRehearserUserIdRaw
    : viewer.userId;

  if (!assignedRehearserUserId) {
    return NextResponse.json({ error: 'Assigned rehearser is required' }, { status: 400 });
  }

  if (!viewer.profile.is_admin && assignedRehearserUserId !== viewer.userId) {
    return NextResponse.json({ error: 'Allowlisted users can only assign to themselves' }, { status: 403 });
  }

  const { data: assignedProfile } = await admin
    .from('profiles')
    .select('id, auditions_enabled, is_admin')
    .eq('id', assignedRehearserUserId)
    .maybeSingle();

  if (!assignedProfile || (!assignedProfile.auditions_enabled && !assignedProfile.is_admin)) {
    return NextResponse.json({ error: 'Assigned rehearser must have Auditions access' }, { status: 400 });
  }

  const storageKey = `${assignedRehearserUserId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${sanitizeStorageFilename(file.name)}`;
  const bytes = await file.arrayBuffer();
  const uploadResult = await admin.storage
    .from(AUDITION_STORAGE_BUCKET)
    .upload(storageKey, bytes, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadResult.error) {
    return NextResponse.json({ error: uploadResult.error.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from('audition_scripts')
    .insert({
      title,
      source_label: sourceLabel,
      storage_key: storageKey,
      original_filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      assigned_rehearser_user_id: assignedRehearserUserId,
      uploaded_by_user_id: viewer.userId,
      status: 'uploaded',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncAdminAuditionRelationships({
    admin,
    auditionScriptId: data.id,
    assignedRehearserUserId,
  });

  return NextResponse.json(data, { status: 201 });
}

import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionTakeDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { AUDITION_STORAGE_BUCKET } from '@/lib/auditions/constants';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
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

  const clips = await Promise.all(detail.clips.map(async (clip) => {
    const { data } = await admin.storage
      .from(AUDITION_STORAGE_BUCKET)
      .createSignedUrl(clip.storage_key, 60 * 60);
    return {
      ...clip,
      signed_url: data?.signedUrl ?? null,
    };
  }));

  return NextResponse.json({
    ...detail,
    clips,
  });
}

export async function PATCH(
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
  const canControl = access.canControlRoom || detail.started_by_user_id === viewer.userId || access.viewerRole === 'admin';
  if (!canControl) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as { status?: string; notes?: string }));
  const updates: Record<string, unknown> = {};
  if (typeof body.notes === 'string') updates.notes = body.notes.trim() || null;
  if (body.status === 'completed') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  }

  const { data: take, error } = await admin
    .from('audition_takes')
    .update(updates)
    .eq('id', takeId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.status === 'completed' && detail.room_session_id) {
    await admin
      .from('audition_room_sessions')
      .update({ active_take_id: null })
      .eq('id', detail.room_session_id);
  }

  return NextResponse.json(take);
}

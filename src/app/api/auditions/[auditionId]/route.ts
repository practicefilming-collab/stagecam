import {
  canAccessAuditionScript,
  canManageAuditionScript,
  getAuditionViewerContext,
  syncAdminAuditionRelationships,
} from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const detail = await getAuditionDetail(auditionId);
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!(await canAccessAuditionScript(viewer, detail.script))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ auditionId: string }> },
) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageAuditionScript(viewer)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
  if (typeof body.source_label === 'string' && body.source_label.trim()) updates.source_label = body.source_label.trim();
  if (typeof body.assigned_rehearser_user_id === 'string' && body.assigned_rehearser_user_id.trim()) {
    updates.assigned_rehearser_user_id = body.assigned_rehearser_user_id.trim();
  }
  if (typeof body.status === 'string') {
    updates.status = body.status;
    if (body.status === 'processing' || body.status === 'ready') {
      updates.processed_by_admin_id = viewer.userId;
      updates.processed_at = new Date().toISOString();
    }
    if (body.status === 'archived') {
      updates.archived_at = new Date().toISOString();
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audition_scripts')
    .update(updates)
    .eq('id', auditionId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assignedRehearserUserId = String(
    updates.assigned_rehearser_user_id ?? data.assigned_rehearser_user_id,
  );
  await syncAdminAuditionRelationships({
    admin,
    auditionScriptId: auditionId,
    assignedRehearserUserId,
  });

  return NextResponse.json(data);
}

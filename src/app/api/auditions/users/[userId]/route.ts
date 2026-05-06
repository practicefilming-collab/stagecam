import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditionViewerContext } from '@/lib/auditions/auth';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!viewer.profile.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (typeof body.auditions_enabled !== 'boolean') {
    return NextResponse.json({ error: 'auditions_enabled must be a boolean' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .update({ auditions_enabled: body.auditions_enabled })
    .eq('id', userId)
    .select('id, display_name, auditions_enabled, is_admin, auth_provider, platform_username, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditionViewerContext } from '@/lib/auditions/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!viewer.profile.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name, auditions_enabled, is_admin, auth_provider, platform_username, created_at')
    .order('display_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

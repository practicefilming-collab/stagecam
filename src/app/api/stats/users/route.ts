import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, auth_provider, platform_username, display_name, created_at')
    .order('created_at', { ascending: false });

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ users: [] });
  }

  // Use service role client to access auth.users for emails
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get emails for all users via admin API
  const emailMap = new Map<string, string>();
  const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
  if (authUsers) {
    for (const au of authUsers) {
      if (au.email) emailMap.set(au.id, au.email);
    }
  }

  // Get recording stats per user
  const { data: recordings } = await supabase
    .from('recordings')
    .select('user_id, room_id, size_bytes');

  const userStats = new Map<string, { scripts: Set<string>; totalRecordings: number; storageBytes: number }>();

  for (const rec of recordings ?? []) {
    let stats = userStats.get(rec.user_id);
    if (!stats) {
      stats = { scripts: new Set(), totalRecordings: 0, storageBytes: 0 };
      userStats.set(rec.user_id, stats);
    }
    stats.scripts.add(rec.room_id);
    stats.totalRecordings++;
    stats.storageBytes += rec.size_bytes ?? 0;
  }

  const users = profiles.map((p) => {
    const stats = userStats.get(p.id);
    return {
      id: p.id,
      displayName: p.display_name,
      authProvider: p.auth_provider ?? 'unknown',
      username: p.platform_username || emailMap.get(p.id) || null,
      joinedAt: p.created_at,
      scriptsParticipated: stats?.scripts.size ?? 0,
      totalRecordings: stats?.totalRecordings ?? 0,
      storageBytes: stats?.storageBytes ?? 0,
    };
  });

  return NextResponse.json({ users });
}

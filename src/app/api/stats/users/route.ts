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

  // Service role client bypasses RLS
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch all profiles (serviceClient bypasses RLS)
  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('id, auth_provider, platform_username, display_name, created_at')
    .order('created_at', { ascending: false });

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ users: [] });
  }

  // Get emails and last sign-in for all users via admin API
  const emailMap = new Map<string, string>();
  const lastLoginMap = new Map<string, string | null>();
  const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
  if (authUsers) {
    for (const au of authUsers) {
      if (au.email) emailMap.set(au.id, au.email);
      lastLoginMap.set(au.id, au.last_sign_in_at ?? null);
    }
  }

  // Get recording stats per user, joining rooms to get script_id (serviceClient bypasses RLS)
  const { data: recordings } = await serviceClient
    .from('recordings')
    .select('user_id, room_id, size_bytes, rooms!inner(script_id)');

  const userStats = new Map<string, { scripts: Set<string>; totalRecordings: number; storageBytes: number }>();

  for (const rec of recordings ?? []) {
    let stats = userStats.get(rec.user_id);
    if (!stats) {
      stats = { scripts: new Set(), totalRecordings: 0, storageBytes: 0 };
      userStats.set(rec.user_id, stats);
    }
    const room = rec.rooms as unknown as { script_id: string };
    if (room?.script_id) {
      stats.scripts.add(room.script_id);
    }
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
      lastLoginAt: lastLoginMap.get(p.id) ?? null,
      scriptsParticipated: stats?.scripts.size ?? 0,
      totalRecordings: stats?.totalRecordings ?? 0,
      storageBytes: stats?.storageBytes ?? 0,
    };
  });

  // Compute totals
  const allScripts = new Set<string>();
  let totalRecordings = 0;
  let totalStorage = 0;
  for (const stats of userStats.values()) {
    for (const sid of stats.scripts) allScripts.add(sid);
    totalRecordings += stats.totalRecordings;
    totalStorage += stats.storageBytes;
  }

  const totals = {
    totalUsers: profiles.length,
    totalScripts: allScripts.size,
    totalRecordings,
    totalStorage,
  };

  return NextResponse.json({ users, totals });
}

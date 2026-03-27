import { createClient } from '@/lib/supabase/server';
import { getPublicIdentitySummary } from '@/lib/auth/identity';
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
    .select('id, auth_provider, platform_username, display_name, public_identity_platform, public_identity_username, public_identity_source_url, created_at, is_admin')
    .order('created_at', { ascending: false });

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ users: [] });
  }

  // Get emails and last sign-in for all users via admin API
  const authEmailLabelMap = new Map<string, string | null>();
  const lastLoginMap = new Map<string, string | null>();
  const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
  if (authUsers) {
    for (const au of authUsers) {
      const email = au.email ?? null;
      const emailLocalPart = email ? email.split('@')[0] ?? null : null;
      authEmailLabelMap.set(au.id, emailLocalPart);
      lastLoginMap.set(au.id, au.last_sign_in_at ?? null);
    }
  }

  type RecordingJoin = {
    user_id: string | null;
    size_bytes: number | null;
    chunk_id: string;
    ai_profile_id?: string | null;
    chunks: {
      scene_id: string;
      scenes: {
        acts: {
          script_id: string;
        };
      };
    } | null;
  };

  const aiAwareSelect = `
    user_id,
    size_bytes,
    chunk_id,
    ai_profile_id,
    chunks!inner(
      scene_id,
      scenes!inner(
        acts!inner(script_id)
      )
    )
  `;

  const legacySelect = `
    user_id,
    size_bytes,
    chunk_id,
    chunks!inner(
      scene_id,
      scenes!inner(
        acts!inner(script_id)
      )
    )
  `;

  async function fetchRecordings(select: string) {
    const { data, error } = await serviceClient
      .from('recordings')
      .select(select)
      .order('created_at', { ascending: false });

    return { data: (data ?? []) as unknown as RecordingJoin[], error };
  }

  const aiAwareRecordings = await fetchRecordings(aiAwareSelect);
  const recordingsResult = aiAwareRecordings.error ? await fetchRecordings(legacySelect) : aiAwareRecordings;
  if (recordingsResult.error) {
    throw recordingsResult.error;
  }
  const recordings = recordingsResult.data;
  const humanRecordings = recordings.filter((rec) => !!rec.user_id);

  const userStats = new Map<string, { scripts: Set<string>; totalRecordings: number; storageBytes: number }>();

  for (const rec of humanRecordings) {
    if (!rec.user_id) continue;

    let stats = userStats.get(rec.user_id);
    if (!stats) {
      stats = { scripts: new Set(), totalRecordings: 0, storageBytes: 0 };
      userStats.set(rec.user_id, stats);
    }

    const scriptId = rec.chunks?.scenes?.acts?.script_id;
    if (scriptId) {
      stats.scripts.add(scriptId);
    }
    stats.totalRecordings++;
    stats.storageBytes += rec.size_bytes ?? 0;
  }

  const users = profiles.map((p) => {
    const stats = userStats.get(p.id);
    const identity = getPublicIdentitySummary(p);
    return {
      id: p.id,
      displayName: identity.displayName,
      authProvider: p.auth_provider ?? 'unknown',
      authAccountLabel: authEmailLabelMap.get(p.id) ?? null,
      isAdmin: p.is_admin ?? false,
      publicIdentityPlatform: identity.platform,
      publicIdentityLabel: identity.summaryLabel,
      username: identity.username ? `@${identity.username}` : null,
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
  for (const rec of humanRecordings) {
    const scriptId = rec.chunks?.scenes?.acts?.script_id;
    if (scriptId) {
      allScripts.add(scriptId);
    }
    totalRecordings += 1;
    totalStorage += rec.size_bytes ?? 0;
  }

  // Count total scripts in DB
  const { count: scriptCount } = await serviceClient
    .from('scripts')
    .select('id', { count: 'exact', head: true });

  const totals = {
    totalUsers: profiles.length,
    totalScripts: scriptCount ?? 0,
    scriptsWithRecordings: allScripts.size,
    totalRecordings,
    totalStorage,
  };

  return NextResponse.json({ users, totals });
}

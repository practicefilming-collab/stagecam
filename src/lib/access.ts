import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicIdentitySummary } from '@/lib/auth/identity';

export interface AccessRosterUser {
  id: string;
  display_name: string;
  auth_provider: string;
  platform_username: string | null;
  created_at: string;
  is_admin: boolean;
  auditions_enabled: boolean;
  auth_account_label: string | null;
  last_login_at: string | null;
  public_identity_label: string;
}

export async function listAccessRosterUsers(): Promise<AccessRosterUser[]> {
  const admin = createAdminClient();
  const [{ data: profiles, error: profileError }, authResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, auth_provider, platform_username, public_identity_platform, public_identity_username, public_identity_source_url, created_at, is_admin, auditions_enabled')
      .order('display_name', { ascending: true }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (profileError) {
    throw profileError;
  }

  const authAccountLabelMap = new Map<string, string | null>();
  const lastLoginMap = new Map<string, string | null>();
  for (const user of authResult.data.users ?? []) {
    const email = user.email ?? null;
    authAccountLabelMap.set(user.id, email ? email.split('@')[0] ?? null : null);
    lastLoginMap.set(user.id, user.last_sign_in_at ?? null);
  }

  return (profiles ?? []).map((profile) => {
    const identity = getPublicIdentitySummary(profile);
    return {
      id: profile.id,
      display_name: profile.display_name,
      auth_provider: profile.auth_provider,
      platform_username: profile.platform_username,
      created_at: profile.created_at,
      is_admin: profile.is_admin ?? false,
      auditions_enabled: profile.auditions_enabled ?? false,
      auth_account_label: authAccountLabelMap.get(profile.id) ?? null,
      last_login_at: lastLoginMap.get(profile.id) ?? null,
      public_identity_label: identity.summaryLabel,
    };
  });
}

export async function countAdmins(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_admin', true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

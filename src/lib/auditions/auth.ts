import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export interface AuditionViewerContext {
  userId: string;
  profile: Profile;
}

export function canAccessAuditionsMode(profile: Pick<Profile, 'is_admin' | 'auditions_enabled'>) {
  return profile.is_admin || profile.auditions_enabled;
}

export async function getAuditionViewerContext(): Promise<AuditionViewerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return null;
  }

  return {
    userId: user.id,
    profile: profile as Profile,
  };
}

export function canAccessAuditionScript(
  viewer: Pick<AuditionViewerContext, 'userId' | 'profile'>,
  script: { assigned_rehearser_user_id: string },
) {
  return viewer.profile.is_admin || script.assigned_rehearser_user_id === viewer.userId;
}

export function canManageAuditionScript(viewer: Pick<AuditionViewerContext, 'profile'>) {
  return viewer.profile.is_admin;
}

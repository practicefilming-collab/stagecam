import { createClient } from '@/lib/supabase/server';
import {
  formatDisplayName,
  getLegacyMappedIdentity,
  isPublicIdentityComplete,
} from '@/lib/auth/identity';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/menu';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, auth_provider, platform_username, display_name, public_identity_platform, public_identity_username, public_identity_source_url')
        .eq('id', data.user.id)
        .single();

      const legacyIdentity = existingProfile ? getLegacyMappedIdentity(existingProfile) : null;

      const nextProfile = {
        auth_provider: 'google' as const,
        platform_username: existingProfile?.platform_username ?? legacyIdentity?.username ?? null,
        display_name: existingProfile?.display_name ?? formatDisplayName('incognito', null),
        public_identity_platform: existingProfile?.public_identity_platform ?? legacyIdentity?.platform ?? null,
        public_identity_username: existingProfile?.public_identity_username ?? legacyIdentity?.username ?? null,
        public_identity_source_url: existingProfile?.public_identity_source_url ?? legacyIdentity?.sourceUrl ?? null,
      };

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          ...nextProfile,
        });
      } else if (
        existingProfile.auth_provider !== nextProfile.auth_provider ||
        existingProfile.platform_username !== nextProfile.platform_username ||
        existingProfile.display_name !== nextProfile.display_name
      ) {
        await supabase
          .from('profiles')
          .update(nextProfile)
          .eq('id', data.user.id);
      }

      // Check if terms are accepted
      const { data: profile } = await supabase
        .from('profiles')
        .select('terms_accepted_at, public_identity_platform, public_identity_username, public_identity_source_url')
        .eq('id', data.user.id)
        .single();

      if (profile && !profile.terms_accepted_at) {
        return NextResponse.redirect(`${origin}/terms`);
      }

      if (profile && !isPublicIdentityComplete(profile)) {
        return NextResponse.redirect(`${origin}/identity?next=${encodeURIComponent(next)}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error - redirect to landing
  return NextResponse.redirect(`${origin}/?error=auth`);
}

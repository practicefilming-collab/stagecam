import { createClient } from '@/lib/supabase/server';
import { formatDisplayName } from '@/lib/auth/display-name';
import { NextResponse } from 'next/server';
import type { AuthProvider } from '@/lib/types';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/menu';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!existingProfile) {
        // Determine provider from user metadata
        const provider = (data.user.app_metadata.provider ?? 'google') as AuthProvider;
        const username = data.user.user_metadata.preferred_username ??
          data.user.user_metadata.user_name ?? null;

        await supabase.from('profiles').insert({
          id: data.user.id,
          auth_provider: provider === 'google' ? 'google' : provider,
          platform_username: provider === 'google' ? null : username,
          display_name: formatDisplayName(
            provider === 'google' ? 'google' : provider,
            username
          ),
        });
      }

      // Check if terms are accepted
      const { data: profile } = await supabase
        .from('profiles')
        .select('terms_accepted_at')
        .eq('id', data.user.id)
        .single();

      if (profile && !profile.terms_accepted_at) {
        return NextResponse.redirect(`${origin}/terms`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error - redirect to landing
  return NextResponse.redirect(`${origin}/?error=auth`);
}

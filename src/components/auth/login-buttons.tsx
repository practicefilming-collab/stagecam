'use client';

import { createClient } from '@/lib/supabase/client';

export function LoginButtons() {
  const supabase = createClient();

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    });
  };

  const signInWithInstagram = async () => {
    // Instagram uses Meta OAuth - configured as custom provider in Supabase
    // For now, redirect to a custom OAuth flow
    window.location.href = `/api/auth/instagram`;
  };

  const signInWithTikTok = async () => {
    // TikTok requires custom OAuth flow (not natively supported by Supabase)
    window.location.href = `/api/auth/tiktok`;
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={signInWithInstagram}
        className="w-full py-3 px-4 rounded-lg font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        style={{ background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
      >
        Continue with Instagram
      </button>

      <button
        onClick={signInWithTikTok}
        className="w-full py-3 px-4 rounded-lg font-medium text-white bg-black border border-border transition-all hover:border-tiktok-teal active:scale-[0.98]"
      >
        <span>Continue with TikTok</span>
      </button>

      <div className="flex items-center gap-3 my-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-muted text-xs uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        onClick={signInWithGoogle}
        className="w-full py-3 px-4 rounded-lg font-medium text-muted bg-surface border border-border transition-all hover:bg-surface-hover hover:text-foreground active:scale-[0.98]"
      >
        Continue Incognito
      </button>
      <p className="text-muted/60 text-xs text-center">
        Uses Google sign-in. Your identity stays hidden in cast lists.
      </p>
    </div>
  );
}

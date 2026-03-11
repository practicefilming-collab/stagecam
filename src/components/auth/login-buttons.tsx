'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function getInitialErrorMessage(error: string | undefined): string {
  if (error === 'auth') {
    return 'Sign-in failed. Try Google again.';
  }
  return '';
}

export function LoginButtons({ authError }: { authError?: string }) {
  const supabase = createClient();
  const [error, setError] = useState(() => getInitialErrorMessage(authError));

  const signInWithGoogle = async () => {
    setError('');

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (authError) {
      setError(authError.message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={signInWithGoogle}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white px-4 py-3 font-medium text-[#3c4043] shadow-sm transition-all hover:border-[#c6c6c6] hover:bg-[#f8f9fa] active:scale-[0.98]"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5 shrink-0"
          viewBox="0 0 18 18"
        >
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.31-1.58-5.02-3.7H1.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.98 10.72A5.41 5.41 0 0 1 3.7 9c0-.6.1-1.18.28-1.72V4.95H1.96A9 9 0 0 0 1 9c0 1.45.35 2.82.96 4.05l2.02-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.33l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 1.96 4.95l2.02 2.33c.71-2.12 2.68-3.7 5.02-3.7Z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>
      <p className="text-muted/60 text-xs text-center">
        After sign-in, choose whether StageCam shows you as Instagram, TikTok, or Incognito.
      </p>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
    </div>
  );
}

'use client';

import { createClient } from '@/lib/supabase/client';
import { TERMS_VERSION } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TermsPage() {
  const [accepting, setAccepting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const acceptTerms = async () => {
    setAccepting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
      return;
    }

    await supabase.from('profiles').update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    }).eq('id', user.id);

    router.push('/menu');
  };

  return (
    <main className="min-h-screen flex items-center justify-center spotlight p-6">
      <div className="max-w-lg w-full bg-surface border border-border rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-gold mb-6">Terms & Conditions</h1>

        <div className="space-y-4 text-sm text-muted mb-8 max-h-64 overflow-y-auto pr-2">
          <p>
            Welcome to StageCam. By using this platform, you agree to the following:
          </p>
          <h3 className="text-foreground font-semibold">1. Rehearsal Purpose</h3>
          <p>
            StageCam is designed for rehearsal and educational purposes only.
            All recordings are made for personal skill development and collaborative practice.
          </p>
          <h3 className="text-foreground font-semibold">2. Recording Consent</h3>
          <p>
            Your webcam recordings may be matched with other performers who have
            recorded lines from the same scene. By recording, you consent to your
            video being viewable by other participants in composite scene playbacks.
          </p>
          <h3 className="text-foreground font-semibold">3. Downloads</h3>
          <p>
            Downloaded recordings are for personal rehearsal use only. Redistribution
            or commercial use of recordings is prohibited.
          </p>
          <h3 className="text-foreground font-semibold">4. Content</h3>
          <p>
            Script text is sourced from publicly available screenplays and used for
            educational/rehearsal purposes under fair use.
          </p>
          <h3 className="text-foreground font-semibold">5. Privacy</h3>
          <p>
            Users signing in via Google (&quot;Incognito&quot; mode) will appear as &quot;Incognito&quot;
            in all cast lists. Instagram and TikTok users will appear with their
            platform handle.
          </p>
        </div>

        <button
          onClick={acceptTerms}
          disabled={accepting}
          className="w-full py-3 px-4 rounded-lg font-medium bg-gold text-black transition-all hover:bg-gold-dim disabled:opacity-50 active:scale-[0.98]"
        >
          {accepting ? 'Accepting...' : 'I Accept'}
        </button>
      </div>
    </main>
  );
}

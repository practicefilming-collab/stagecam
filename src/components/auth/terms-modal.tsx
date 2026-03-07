'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TERMS_VERSION } from '@/lib/constants';

interface TermsModalProps {
  onAccepted: () => void;
}

export function TermsModal({ onAccepted }: TermsModalProps) {
  const [accepting, setAccepting] = useState(false);
  const supabase = createClient();

  const accept = async () => {
    setAccepting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('profiles').update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    }).eq('id', user.id);

    onAccepted();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="max-w-lg w-full bg-surface border border-border rounded-2xl p-8">
        <h2 className="text-xl font-bold text-gold mb-4">Terms & Conditions</h2>

        <div className="space-y-3 text-sm text-muted mb-6 max-h-48 overflow-y-auto pr-2">
          <p>By using StageCam, you agree that:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>This platform is for rehearsal and educational purposes only.</li>
            <li>Your recordings may be matched with other performers in composite scene playbacks.</li>
            <li>Downloads are for personal rehearsal use only.</li>
            <li>Script text is used under fair use for educational purposes.</li>
          </ul>
        </div>

        <button
          onClick={accept}
          disabled={accepting}
          className="w-full py-3 bg-gold text-black rounded-xl font-semibold hover:bg-gold-dim transition-colors disabled:opacity-50"
        >
          {accepting ? 'Accepting...' : 'I Accept'}
        </button>
      </div>
    </div>
  );
}

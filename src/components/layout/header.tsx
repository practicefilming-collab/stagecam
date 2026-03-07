'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';

export function Header({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <header className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/menu" className="text-gold font-bold text-lg tracking-tight hover:text-gold-dim transition-colors">
          StageCam
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/menu" className="text-sm text-muted hover:text-foreground transition-colors">
            Menu
          </Link>
          <Link href="/history" className="text-sm text-muted hover:text-foreground transition-colors">
            History
          </Link>
          <Link href="/stats" className="text-sm text-muted hover:text-foreground transition-colors">
            Stats
          </Link>
          <Link href="/requests" className="text-sm text-muted hover:text-foreground transition-colors">
            Requests
          </Link>

          <div className="h-4 w-px bg-border mx-1" />

          <span className="text-xs text-muted">
            {profile.display_name}
          </span>
          <button
            onClick={signOut}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}

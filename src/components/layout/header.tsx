'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';

export function Header({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const links = [
    { href: '/menu', label: 'Menu' },
    { href: '/history', label: 'History' },
    { href: '/stats/me', label: 'Stats' },
    ...(profile.is_admin ? [{ href: '/stats', label: 'Admin Stats' }] : []),
    { href: '/requests', label: 'Requests' },
  ];

  const close = () => setOpen(false);

  return (
    <header className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/menu" className="text-gold font-bold text-lg tracking-tight hover:text-gold-dim transition-colors">
          StageCam
        </Link>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-col gap-1 p-2 -mr-2"
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-foreground transition-transform ${open ? 'rotate-45 translate-y-[3px]' : ''}`} />
          <span className={`block w-5 h-0.5 bg-foreground transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-foreground transition-transform ${open ? '-rotate-45 -translate-y-[3px]' : ''}`} />
        </button>
      </div>

      {/* Dropdown menu */}
      {open && (
        <nav className="border-t border-border bg-surface px-4 py-3 space-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className={`block px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname === link.href
                  ? 'text-gold bg-gold/10'
                  : 'text-muted hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="border-t border-border mt-2 pt-2 flex items-center justify-between px-3 py-2">
            <span className="text-xs text-muted">{profile.display_name}</span>
            <button
              onClick={() => { close(); signOut(); }}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

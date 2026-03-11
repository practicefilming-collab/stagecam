import { createClient } from '@/lib/supabase/server';
import { isPublicIdentityComplete } from '@/lib/auth/identity';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/header';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile?.terms_accepted_at) {
    redirect('/terms');
  }

  if (!isPublicIdentityComplete(profile)) {
    redirect('/identity');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header profile={profile} />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

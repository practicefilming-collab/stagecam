import { PublicIdentityEditor } from '@/components/account/public-identity-editor';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AccountPage() {
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

  if (!profile) {
    redirect('/');
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <PublicIdentityEditor
        profile={profile}
        title="Account"
        description="Google remains your login method. This page controls how StageCam shows you publicly in badges, cast lists, playback labels, and admin views."
        submitLabel="Update Identity"
        nextPath="/account"
      />
    </div>
  );
}

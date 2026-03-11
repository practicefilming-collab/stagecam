import { PublicIdentityEditor } from '@/components/account/public-identity-editor';
import { getDefaultIdentityDraft, isPublicIdentityComplete } from '@/lib/auth/identity';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
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

  if (!profile.terms_accepted_at) {
    redirect('/terms');
  }

  if (isPublicIdentityComplete(profile)) {
    redirect(next ?? '/menu');
  }

  const draft = getDefaultIdentityDraft(profile);

  return (
    <main className="min-h-screen spotlight px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <PublicIdentityEditor
          profile={{
            ...profile,
            public_identity_platform: draft.isResolved ? profile.public_identity_platform : null,
            public_identity_username: draft.isResolved ? profile.public_identity_username : null,
            public_identity_source_url: draft.isResolved ? profile.public_identity_source_url : null,
          }}
          title="How Do You Want To Be Seen?"
          description="Choose the public identity StageCam uses for your badge, cast lists, playback labels, and your admin-style record preview. You can change this later from Account."
          submitLabel="Save Identity"
          nextPath={next ?? '/menu'}
        />
      </div>
    </main>
  );
}

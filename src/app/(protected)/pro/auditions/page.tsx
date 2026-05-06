import { redirect } from 'next/navigation';
import { getAuditionViewerContext, canAccessAuditionsMode } from '@/lib/auditions/auth';
import { listAuditionScriptsForViewer } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { AuditionsDashboard } from '@/components/auditions/dashboard';

export default async function AuditionsPage() {
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');
  if (!canAccessAuditionsMode(viewer.profile)) redirect('/menu');

  const scripts = await listAuditionScriptsForViewer(viewer);
  const admin = createAdminClient();
  const { data: uploadUsers } = viewer.profile.is_admin
    ? await admin
        .from('profiles')
        .select('id, display_name')
        .or('auditions_enabled.eq.true,is_admin.eq.true')
        .order('display_name')
    : { data: [{ id: viewer.userId, display_name: viewer.profile.display_name }] };
  const { data: accessUsers } = viewer.profile.is_admin
    ? await admin
        .from('profiles')
        .select('id, display_name, auditions_enabled, is_admin, auth_provider, platform_username, created_at')
        .order('display_name')
    : { data: [] };

  return (
    <AuditionsDashboard
      initialScripts={scripts}
      canManage={viewer.profile.is_admin}
      selfUserId={viewer.userId}
      uploadUsers={uploadUsers ?? []}
      accessUsers={accessUsers ?? []}
    />
  );
}

import { redirect } from 'next/navigation';
import { AuditionDetailView } from '@/components/auditions/detail';
import { canAccessAuditionScript, canAccessAuditionsMode, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function AuditionDetailPage({
  params,
}: {
  params: Promise<{ auditionId: string }>;
}) {
  const { auditionId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');
  if (!canAccessAuditionsMode(viewer.profile)) redirect('/menu');

  const detail = await getAuditionDetail(auditionId);
  if (!detail) redirect('/pro/auditions');
  if (!canAccessAuditionScript(viewer, detail.script)) redirect('/pro/auditions');

  const admin = createAdminClient();
  const { data: uploadUsers } = viewer.profile.is_admin
    ? await admin
        .from('profiles')
        .select('id, display_name')
        .or('auditions_enabled.eq.true,is_admin.eq.true')
        .order('display_name')
    : { data: [] };

  return (
    <AuditionDetailView
      initialDetail={detail}
      viewerUserId={viewer.userId}
      canManage={viewer.profile.is_admin}
      uploadUsers={uploadUsers ?? []}
    />
  );
}

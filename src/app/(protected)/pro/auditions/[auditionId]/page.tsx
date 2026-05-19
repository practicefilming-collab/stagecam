import { redirect } from 'next/navigation';
import { AuditionDetailView } from '@/components/auditions/detail';
import {
  canAccessAuditionsMode,
  getAuditionScriptAccessContext,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
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
  const access = await getAuditionScriptAccessContext({ viewer, script: detail.script });
  if (!access.canAccess) redirect('/pro/auditions');

  const admin = createAdminClient();
  const linkedScript = detail.linkedScript;
  const { data: uploadUsers } = viewer.profile.is_admin
    ? await admin
        .from('profiles')
        .select('id, display_name')
        .or('auditions_enabled.eq.true,is_admin.eq.true')
        .order('display_name')
    : { data: [] };
  const initialAiState = viewer.profile.is_admin && linkedScript
    ? await (async () => {
        const [{ data: profiles }, { data: runs }] = await Promise.all([
          admin
            .from('ai_profiles')
            .select('id, display_name, voice_persona_id, voice_persona_label, status, metadata')
            .eq('script_id', linkedScript.id)
            .order('created_at', { ascending: true }),
          admin
            .from('script_generation_runs')
            .select('id, status, total_lines, persisted_lines, failed_lines, created_at, started_at, finished_at')
            .eq('script_id', linkedScript.id)
            .order('created_at', { ascending: false })
            .limit(8),
        ]);

        return {
          linkedScript: {
            id: linkedScript.id,
            title: linkedScript.title,
            slug: linkedScript.slug,
          },
          profiles: profiles ?? [],
          runs: runs ?? [],
        };
      })()
    : null;

  return (
    <AuditionDetailView
      initialDetail={detail}
      canManage={viewer.profile.is_admin}
      canHostRoom={access.canControlRoom}
      uploadUsers={uploadUsers ?? []}
      initialAiState={initialAiState}
      relationshipLabel={access.relationshipLabel}
    />
  );
}

import { redirect } from 'next/navigation';
import { AuditionSceneView } from '@/components/auditions/scene-view';
import { canAccessAuditionScript, canAccessAuditionsMode, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionDetail, listAttemptsForScene } from '@/lib/auditions/data';

export default async function AuditionScenePage({
  params,
}: {
  params: Promise<{ auditionId: string; sceneId: string }>;
}) {
  const { auditionId, sceneId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');
  if (!canAccessAuditionsMode(viewer.profile)) redirect('/menu');

  const detail = await getAuditionDetail(auditionId);
  if (!detail) redirect('/pro/auditions');
  if (!canAccessAuditionScript(viewer, detail.script)) redirect('/pro/auditions');

  const scene = detail.scenes.find((item) => item.id === sceneId);
  if (!scene) redirect(`/pro/auditions/${auditionId}`);

  const attempts = await listAttemptsForScene({
    auditionId,
    sceneId,
    userId: viewer.profile.is_admin ? undefined : detail.script.assigned_rehearser_user_id,
  });

  return (
    <AuditionSceneView
      detail={detail}
      scene={scene}
      attempts={attempts}
      viewerUserId={viewer.userId}
      canManage={viewer.profile.is_admin}
    />
  );
}

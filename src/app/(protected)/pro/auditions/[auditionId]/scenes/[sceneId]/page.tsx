import { redirect } from 'next/navigation';
import { AuditionSceneView } from '@/components/auditions/scene-view';
import {
  canAccessAuditionsMode,
  getAuditionScriptAccessContext,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { getAuditionDetail, listAttemptsForScene } from '@/lib/auditions/data';
import { listTakesForScene } from '@/lib/auditions/data';

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
  const access = await getAuditionScriptAccessContext({ viewer, script: detail.script });
  if (!access.canAccess) redirect('/pro/auditions');

  const scene = detail.scenes.find((item) => item.id === sceneId);
  if (!scene) redirect(`/pro/auditions/${auditionId}`);

  const [attempts, takes] = await Promise.all([
    listAttemptsForScene({
      auditionId,
      sceneId,
      userId: access.viewerRole === 'assigned_rehearser' || access.viewerRole === 'admin'
        ? undefined
        : viewer.userId,
    }),
    listTakesForScene({ sceneId }),
  ]);

  return (
    <AuditionSceneView
      detail={detail}
      scene={scene}
      attempts={attempts}
      takes={takes}
      viewerUserId={viewer.userId}
      canManage={viewer.profile.is_admin}
    />
  );
}

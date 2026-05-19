import { redirect } from 'next/navigation';
import { AuditionTakePlayer } from '@/components/auditions/take-player';
import {
  canAccessAuditionsMode,
  getAuditionScriptAccessContext,
  getAuditionViewerContext,
} from '@/lib/auditions/auth';
import { getAuditionDetail } from '@/lib/auditions/data';

export default async function AuditionTakeReplayPage({
  params,
}: {
  params: Promise<{ auditionId: string; sceneId: string; takeId: string }>;
}) {
  const { auditionId, sceneId, takeId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');
  if (!canAccessAuditionsMode(viewer.profile)) redirect('/menu');

  const detail = await getAuditionDetail(auditionId);
  if (!detail) redirect('/pro/auditions');

  const access = await getAuditionScriptAccessContext({ viewer, script: detail.script });
  if (!access.canAccess) redirect('/pro/auditions');

  const scene = detail.scenes.find((item) => item.id === sceneId);
  if (!scene) redirect(`/pro/auditions/${auditionId}`);

  return (
    <AuditionTakePlayer
      auditionId={auditionId}
      sceneId={sceneId}
      takeId={takeId}
    />
  );
}

import { redirect } from 'next/navigation';
import { AuditionTakeRecorder } from '@/components/auditions/take-recorder';
import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionTakeDetail } from '@/lib/auditions/data';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';

export default async function AuditionTakePage({
  params,
}: {
  params: Promise<{ roomCode: string; takeId: string }>;
}) {
  const { roomCode, takeId } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');

  const [bundle, take] = await Promise.all([
    getAuditionRoomBundle(roomCode),
    getAuditionTakeDetail(takeId),
  ]);

  if (!bundle || !take) redirect('/menu');
  const access = await getAuditionScriptAccessContext({ viewer, script: bundle.script });
  if (!access.canAccess) redirect('/menu');

  const scene = bundle.scenes.find((item) => item.id === take.audition_scene_id);
  if (!scene) redirect(`/rooms/auditions/${roomCode}`);

  const canControlTake = access.viewerRole === 'admin' || access.viewerRole === 'assigned_rehearser' || bundle.room.host_user_id === viewer.userId;

  return (
    <AuditionTakeRecorder
      roomCode={roomCode}
      take={take}
      scene={scene}
      viewerUserId={viewer.userId}
      canControlTake={canControlTake}
    />
  );
}

import { redirect } from 'next/navigation';
import { AuditionRoomView } from '@/components/auditions/room';
import { getAuditionViewerContext } from '@/lib/auditions/auth';
import { getAuditionRoomBundle } from '@/lib/auditions/room-data';

export default async function AuditionRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');

  const bundle = await getAuditionRoomBundle(roomCode);
  if (!bundle) redirect('/menu');

  const isAssignedRehearser = bundle.script.assigned_rehearser_user_id === viewer.userId;
  const viewerRole = viewer.profile.is_admin
    ? 'admin'
    : bundle.room.host_user_id === viewer.userId
      ? 'host'
      : isAssignedRehearser
        ? 'assigned_rehearser'
        : 'guest';

  return (
    <AuditionRoomView
      roomCode={roomCode}
      initialBundle={{
        ...bundle,
        viewer_role: viewerRole,
        can_control_room: viewer.profile.is_admin || bundle.room.host_user_id === viewer.userId || isAssignedRehearser,
      }}
    />
  );
}

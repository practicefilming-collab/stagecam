import { redirect } from 'next/navigation';
import { AuditionRoomView } from '@/components/auditions/room';
import { getAuditionScriptAccessContext, getAuditionViewerContext } from '@/lib/auditions/auth';
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

  const access = await getAuditionScriptAccessContext({ viewer, script: bundle.script });
  const isAssignedRehearser = access.viewerRole === 'assigned_rehearser';
  const viewerRole = access.viewerRole === 'admin'
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
        viewer_user_id: viewer.userId,
        viewer_role: viewerRole,
        relationship_label: access.relationshipLabel,
        can_control_room: access.canControlRoom || bundle.room.host_user_id === viewer.userId || isAssignedRehearser,
      }}
    />
  );
}

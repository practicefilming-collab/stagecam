import { redirect } from 'next/navigation';
import { AccessDashboard } from '@/components/access/access-dashboard';
import { getAuditionViewerContext } from '@/lib/auditions/auth';
import { listAccessRosterUsers } from '@/lib/access';

export default async function AccessPage() {
  const viewer = await getAuditionViewerContext();
  if (!viewer) redirect('/');
  if (!viewer.profile.is_admin) redirect('/menu');

  const users = await listAccessRosterUsers();

  return <AccessDashboard initialUsers={users} selfUserId={viewer.userId} />;
}

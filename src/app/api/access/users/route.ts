import { NextResponse } from 'next/server';
import { listAccessRosterUsers } from '@/lib/access';
import { getAuditionViewerContext } from '@/lib/auditions/auth';

export async function GET() {
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!viewer.profile.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await listAccessRosterUsers();
  return NextResponse.json(users);
}

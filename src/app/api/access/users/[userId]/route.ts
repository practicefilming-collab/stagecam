import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { countAdmins, listAccessRosterUsers } from '@/lib/access';
import { getAuditionViewerContext } from '@/lib/auditions/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const viewer = await getAuditionViewerContext();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!viewer.profile.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, boolean> = {};

  if ('is_admin' in body) {
    if (typeof body.is_admin !== 'boolean') {
      return NextResponse.json({ error: 'is_admin must be a boolean' }, { status: 400 });
    }
    if (viewer.userId === userId && body.is_admin === false) {
      return NextResponse.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
    }
    updates.is_admin = body.is_admin;
  }

  if ('auditions_enabled' in body) {
    if (typeof body.auditions_enabled !== 'boolean') {
      return NextResponse.json({ error: 'auditions_enabled must be a boolean' }, { status: 400 });
    }
    updates.auditions_enabled = body.auditions_enabled;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: currentUser, error: currentUserError } = await admin
    .from('profiles')
    .select('id, is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (currentUserError) {
    return NextResponse.json({ error: currentUserError.message }, { status: 500 });
  }

  if (!currentUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (updates.is_admin === false && currentUser.is_admin) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 });
    }
  }

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = await listAccessRosterUsers();
  const updatedUser = users.find((user) => user.id === userId);

  if (!updatedUser) {
    return NextResponse.json({ error: 'User not found after update' }, { status: 404 });
  }

  return NextResponse.json(updatedUser);
}

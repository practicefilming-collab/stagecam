import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { recording_id } = await request.json();

  // Toggle like
  const { data: existing } = await supabase
    .from('chunk_likes')
    .select('id')
    .eq('recording_id', recording_id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    await supabase.from('chunk_likes').delete().eq('id', existing.id);
    return NextResponse.json({ liked: false });
  }

  await supabase.from('chunk_likes').insert({
    recording_id,
    user_id: user.id,
  });

  return NextResponse.json({ liked: true });
}

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: requests } = await supabase
    .from('script_requests')
    .select('*, script_request_votes(count), profiles!inner(display_name)')
    .order('created_at', { ascending: false });

  // Sort by vote count
  const sorted = (requests ?? []).sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aVotes = (a.script_request_votes as { count: number }[])?.[0]?.count ?? 0;
    const bVotes = (b.script_request_votes as { count: number }[])?.[0]?.count ?? 0;
    return bVotes - aVotes;
  });

  return NextResponse.json(sorted);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { title } = await request.json();

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('script_requests')
    .insert({ user_id: user.id, title: title.trim() })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-vote for own request
  await supabase.from('script_request_votes').insert({
    request_id: data.id,
    user_id: user.id,
  });

  return NextResponse.json(data);
}

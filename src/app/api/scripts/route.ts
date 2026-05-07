import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (slug) {
    const { data: script } = await supabase
      .from('scripts')
      .select('*, acts(*, scenes(*))')
      .eq('slug', slug)
      .eq('is_internal', false)
      .single();
    return NextResponse.json(script);
  }

  const { data: scripts } = await supabase
    .from('scripts')
    .select('*')
    .eq('is_internal', false)
    .order('rank', { ascending: true });

  return NextResponse.json(scripts ?? []);
}

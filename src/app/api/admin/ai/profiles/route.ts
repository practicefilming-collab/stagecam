import { isAdmin } from '@/lib/admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { formatVoicePersonaLabel, normalizeVoicePersonaId } from '@/lib/generation/voices';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const scriptId = searchParams.get('script_id');

  let query = admin
    .from('ai_profiles')
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (scriptId) {
    query = query.eq('script_id', scriptId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const {
    script_id,
    display_name,
    voice_persona_id,
    voice_persona_label,
    metadata,
  } = await request.json();
  if (!script_id || !display_name || !voice_persona_id) {
    return NextResponse.json({ error: 'script_id, display_name, and voice_persona_id are required.' }, { status: 400 });
  }

  const normalizedVoiceId = normalizeVoicePersonaId(String(voice_persona_id));
  if (!normalizedVoiceId) {
    return NextResponse.json({ error: 'voice_persona_id must be one of: eve, ara, rex, sal, leo.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ai_profiles')
    .insert({
      script_id,
      display_name: String(display_name).trim(),
      voice_persona_id: normalizedVoiceId,
      voice_persona_label:
        typeof voice_persona_label === 'string' && voice_persona_label.trim()
          ? voice_persona_label.trim()
          : formatVoicePersonaLabel(normalizedVoiceId),
      platform: 'Grok',
      metadata: typeof metadata === 'object' && metadata !== null ? metadata : {},
    })
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create AI profile.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.display_name === 'string' && body.display_name.trim()) {
    updates.display_name = body.display_name.trim();
  }
  if (typeof body.status === 'string' && ['active', 'paused', 'archived'].includes(body.status)) {
    updates.status = body.status;
  }
  if (typeof body.voice_persona_id === 'string') {
    const normalizedVoiceId = normalizeVoicePersonaId(body.voice_persona_id);
    if (!normalizedVoiceId) {
      return NextResponse.json({ error: 'voice_persona_id must be one of: eve, ara, rex, sal, leo.' }, { status: 400 });
    }
    updates.voice_persona_id = normalizedVoiceId;
    updates.voice_persona_label =
      typeof body.voice_persona_label === 'string' && body.voice_persona_label.trim()
        ? body.voice_persona_label.trim()
        : formatVoicePersonaLabel(normalizedVoiceId);
  } else if (typeof body.voice_persona_label === 'string') {
    updates.voice_persona_label = body.voice_persona_label.trim() || null;
  }
  if (typeof body.metadata === 'object' && body.metadata !== null) {
    updates.metadata = body.metadata;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid updates provided.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ai_profiles')
    .update(updates)
    .eq('id', id)
    .select('id, script_id, display_name, status, platform, voice_persona_id, voice_persona_label, metadata, created_at, updated_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to update AI profile.' }, { status: 500 });
  }

  return NextResponse.json(data);
}

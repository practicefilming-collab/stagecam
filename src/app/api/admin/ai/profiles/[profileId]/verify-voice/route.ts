import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createVoiceVerificationSample, loadAiProfileForVerification } from '@/lib/generation/voice-verification';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing XAI_API_KEY' }, { status: 500 });
  }

  const admin = createAdminClient();
  const profile = await loadAiProfileForVerification(admin, profileId).catch((error) => {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI profile not found' }, { status: 404 });
  });

  if (profile instanceof NextResponse) {
    return profile;
  }

  const sample = await createVoiceVerificationSample({
    admin,
    profile,
    apiKey,
  });

  return NextResponse.json({
    sample: {
      id: sample.id,
      status: sample.status,
      requestedVoicePersonaId: sample.requested_voice_persona_id,
      resolvedVoiceId: sample.resolved_voice_id,
      errorMessage: sample.error_message,
      createdAt: sample.created_at,
    },
  }, { status: 201 });
}

import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { runAiGenerationWatchdog } from '@/lib/generation/watchdog';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function isAuthorizedBySecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const workerToken = process.env.AI_GENERATION_WORKER_TOKEN ?? process.env.EXPORT_WORKER_TOKEN;
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const incomingWorkerToken = request.headers.get('x-ai-generation-worker-token');

  return (
    (Boolean(cronSecret) && bearerToken === cronSecret) ||
    (Boolean(workerToken) && incomingWorkerToken === workerToken)
  );
}

async function isAuthorizedByAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  return isAdmin(supabase);
}

export async function GET(request: Request) {
  if (!(isAuthorizedBySecret(request) || await isAuthorizedByAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = new URL(request.url).searchParams.get('runId');
  const admin = createAdminClient();
  const result = await runAiGenerationWatchdog({
    admin,
    baseUrl: request.url,
    runId,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}

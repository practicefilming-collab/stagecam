import { execSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const requiredTables = [
  'audition_scripts',
  'audition_scenes',
  'audition_roles',
  'audition_target_roles',
  'audition_scene_progress',
  'audition_room_sessions',
  'audition_room_participants',
  'audition_attempts',
];

const expectedExistingButNonAuditionTables = [
  'ai_voice_verification_samples',
];

async function main() {
  const report = {};

  const { error: profileError } = await supabase.from('profiles').select('auditions_enabled').limit(1);
  report.profile_flag = profileError ? { ok: false, error: profileError.message } : { ok: true };

  report.tables = {};
  for (const tableName of requiredTables) {
    const { error } = await supabase.from(tableName).select('*', { head: true, count: 'exact' });
    report.tables[tableName] = error ? { ok: false, error: error.message } : { ok: true };
  }

  report.related_tables = {};
  for (const tableName of expectedExistingButNonAuditionTables) {
    const { error } = await supabase.from(tableName).select('*', { head: true, count: 'exact' });
    report.related_tables[tableName] = error ? { ok: false, error: error.message } : { ok: true };
  }

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    report.bucket = { ok: false, error: bucketError.message };
  } else {
    const bucket = buckets.find((item) => item.id === 'audition-scripts');
    report.bucket = bucket ? { ok: true, public: bucket.public } : { ok: false, error: 'audition-scripts bucket missing' };
  }

  try {
    const npxCommand = process.platform === 'win32' ? 'npx' : 'npx';
    const migrationList = execSync(`${npxCommand} supabase migration list`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const has017Applied = /\b017\s+\|\s+017\b/.test(migrationList);
    const has018Applied = /\b018\s+\|\s+018\b/.test(migrationList);
    report.migrations = {
      ok: has017Applied && has018Applied,
      has017Applied,
      has018Applied,
      output: migrationList,
    };
  } catch (error) {
    report.migrations = {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to read migration list',
    };
  }

  console.log(JSON.stringify(report, null, 2));
}

void main();

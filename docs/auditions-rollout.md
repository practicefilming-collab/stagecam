# Auditions Rollout Checklist

## Purpose

Use this checklist before giving real admins and rehearsers access to the Auditions sprint.

## Environment checks

Run:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL=(Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line.Split('=',2)[1]
$env:SUPABASE_SERVICE_ROLE_KEY=(Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=').Line.Split('=',2)[1]
node scripts/verify-auditions-rollout.mjs
```

Confirm:

- `profiles.auditions_enabled` exists
- all audition tables report `ok: true`
- `ai_voice_verification_samples` reports `ok: true`
- the `audition-scripts` bucket exists and is private
- migrations `017` and `018` are both recorded as applied

## Migration history

Expected steady state:

- `017` and `018` are both recorded as applied remotely
- if the schema already exists but history is behind, repair the migration history rather than reapplying the migration blindly

Safe repair pattern:

1. verify remote schema parity first
2. if `017` is already present remotely but missing from history, record it as applied:

```powershell
npx supabase migration repair 017 --status applied
```

3. if `018` is already present remotely but missing from history, record it as applied:

```powershell
npx supabase migration repair 018 --status applied
```

4. if either migration is genuinely absent in the target environment, promote it properly before marking it applied

## First-user walkthrough

Validate the full staged flow with real accounts:

1. admin enables `auditions_enabled` for one rehearser
2. admin uploads a `PDF`, `DOCX`, or `TXT`
3. admin assigns the rehearser
4. admin creates scenes and roles
5. admin marks the audition `ready`
6. rehearser opens the audition and selects a target role
7. rehearser marks progress steps and saves at least one take
8. rehearser or admin hosts a room
9. invited authenticated guest joins via room link
10. guest can see the live room scene only
11. guest cannot access `/pro/auditions`
12. ending the room removes live session access

## Known repo caveat

`npm run lint` currently fails on pre-existing non-Auditions files in Clips and rehearsal code. Use `npx tsc --noEmit` plus the rollout checklist above as the minimum release gate for this sprint unless the broader lint debt is addressed.

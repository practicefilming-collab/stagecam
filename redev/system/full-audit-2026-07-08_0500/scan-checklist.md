# Scan Checklist — Full Audit 2026-07-08_0500

Areas checked in this audit. ✅ = checked, findings recorded in `report.md`.

## Build / tooling
- [x] `npm run build` passes ✅
- [x] `npm run lint` passes/fails ✅ (fails: 9 errors, 8 warnings)
- [x] Test runner present + tests runnable ✅ (none exist — gap)

## Permissions & privacy
- [x] Direct client Supabase queries on privacy-bearing tables (`scripts`, `audition_*`,
      `recordings`, `profiles`) missing filters that the API applies ✅
- [x] `is_internal` (private/audition) script exposure across UI, hooks, and API ✅
- [x] `/api/rooms` create/update/get validation of `script_id` privacy ✅
- [x] Audition access-control (`getAuditionScriptAccessContext`) coverage on audition routes ✅
- [x] Profile queries scoped to current user ✅ (no issue)

## Async pipeline resilience
- [x] Clip pipeline: mid-stage failure state, retry, partial-artifact cleanup ✅
- [x] Clip pipeline: silent failures (Whisper, segment insert, cleanup) ✅
- [x] AI generation: partial-failure state (synthesized-but-not-persisted) ✅
- [x] AI generation: watchdog recovery coverage & cooldown/clock-skew logic ✅
- [x] Job/worker concurrency & double-processing ✅

## API route hardening
- [x] Presigned upload URLs: ownership validation ✅
- [x] Presigned upload URLs: extension whitelist + size limits ✅
- [x] Room-code collision exhaustion handling ✅
- [x] `recording_source` trust boundary ✅ (no issue — server-only)
- [x] Spot check: missing auth, admin-client misuse, trusting client-supplied ids ✅

## Data model / schema
- [x] `is_internal` / `source_audition_script_id` semantics (migration 019) ✅
- [x] RLS coverage on `scripts` / `recordings` ✅ (auth-only, no row filtering)

## Not covered this pass (candidates for future sessions)
- [ ] Realtime channel authorization (`supabase/realtime.ts`)
- [ ] Storage bucket RLS policy correctness end-to-end (`003_storage_policies.sql`)
- [ ] Terms-version re-acceptance migration path
- [ ] Rate limiting / abuse controls on write endpoints

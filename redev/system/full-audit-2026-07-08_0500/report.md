# Audit Report — StageCam Full-Project Audit

**Session:** 2026-07-08_0500 · **Lane:** system · **Method:** static audit (build/lint + 4 code sweeps)

## 1. Checks run

| Check | Command | Result |
|-------|---------|--------|
| Production build | `npm run build` | ✅ **Pass** — compiles, all routes emit |
| Lint | `npm run lint` | ❌ **Fail** — 9 errors, 8 warnings (see F-14) |
| Unit/integration tests | — | ⚠️ **None exist** — no runner, no `*.test.ts`, no `test` script (F-15) |

Note: the build passes despite lint errors because Next's build does not gate on these
ESLint rules; `npm run lint` is a separate, currently-red check.

## 2. Findings

Severity: 🔴 High · 🟠 Medium · 🟢 Low. Every finding cites verified `file:line`.

### A. Script privacy — private/audition scripts leak (the trigger bug, and it's systemic)

Audition-derived scripts are marked `is_internal = true` (migration `019`;
`src/lib/auditions/processing.ts:511`). Only `src/app/api/scripts/route.ts:20,28` filters
them (`.eq('is_internal', false)`). That filter is missing everywhere else, forming a full
read + persist + re-read attack chain.

| ID | Sev | Location | Failure scenario |
|----|-----|----------|------------------|
| F-1 | 🔴 | `src/app/(protected)/stage/create/page.tsx:20-24` | `.from('scripts').select('*')` with no filter → private audition scripts shown in the create-stage picker. **This is the reported bug.** |
| F-2 | 🔴 | `src/app/(protected)/stage/[roomCode]/page.tsx:360-364` | Same unfiltered query in the backstage script picker. |
| F-3 | 🔴 | `src/app/api/rooms/route.ts:34-59` (POST) | Accepts arbitrary `script_id` with no `is_internal` check → user who knows a private id can create a room bound to it, even if the UI were filtered. |
| F-4 | 🔴 | `src/app/api/rooms/[roomId]/route.ts:33` (PATCH) | Updates `script_id` without validating privacy → private script persisted onto a room. |
| F-5 | 🔴 | `src/app/api/rooms/route.ts:73-78` (GET `?code=`) | `.select('*, scripts(*)')` returns full private script content to anyone with the room code. (List endpoint at line 95 safely selects only `scripts(title, year)`.) |
| F-6 | 🟠 | `src/hooks/use-room.ts:28` | `.from('scripts').select('*').eq('id', …)` unfiltered → renders private script client-side. |
| F-7 | 🟠 | `src/app/(protected)/stage/[roomCode]/rehearse/page.tsx:49-53` | Unfiltered script load in the rehearsal/performance UI. |

**Root cause:** the correct `is_internal=false` guard exists only in `/api/scripts`; it was
never applied to direct client queries, the room API (create/update/get), or the room hook.
The UI fix (F-1/F-2) alone does not close the hole — F-3/F-4/F-5 are exploitable directly.

### B. Clip ingestion pipeline — no recovery, silent failures

| ID | Sev | Location | Failure scenario |
|----|-----|----------|------------------|
| F-8 | 🔴 | `src/lib/clips/pipeline/analyze.ts:288-291` | Whisper failure is caught and swallowed, returns `{ segments: [] }` as a valid result → clip finalized with no speech data, no error surfaced. |
| F-9 | 🔴 | `src/lib/clips/pipeline/orchestrator.ts:14-46` | Any stage failure sets `pipeline_status='failed'` with no retry/resume → clip is permanently dead; orphaned R2 artifacts from earlier stages remain. |
| F-10 | 🟠 | `src/lib/clips/pipeline/extract.ts:79` / `download.ts:74` | Status advanced before confirming both artifacts uploaded → inconsistent state (e.g. `audio_wav_path` set, `audio_aac_path` null, status already `analyzing`). |
| F-11 | 🟠 | `src/lib/clips/pipeline/analyze.ts:310-320` & `263-269` | Segment auto-insert not error-checked and duration fallback `?? 0` → `pipeline_status='ready_for_review'` with zero/no segment rows. |

### C. AI line-generation pipeline — partial-failure orphans, watchdog blind spots

| ID | Sev | Location | Failure scenario |
|----|-----|----------|------------------|
| F-12 | 🔴 | `src/lib/generation/execute.ts:337-399` | Recording inserted but the follow-up update to `status='persisted'` / `recording_id` fails → recording orphaned, line record stuck at `synthesized` forever. |
| F-13 | 🔴 | `src/lib/generation/watchdog.ts:112,137` | Watchdog only scans job statuses `queued/processing/failed`; line records stuck at `interpreted`/`synthesized` are never recovered, yet the scene job can read as succeeded. |
| F-16 | 🟠 | `src/lib/generation/execute.ts:309-325` | Grok interpretation failure silently falls back to a heuristic with no error flag → line marked interpreted with wrong interpretation. |
| F-17 | 🟠 | `src/lib/generation/watchdog.ts:209` | Cooldown check treats a future `lastKickoffAt` (clock skew) as permanent cooldown → queued jobs never retried. |
| F-18 | 🟢 | `src/lib/generation/jobs.ts:102-104` | Aggregates `persisted_lines`/`failed_lines` without bounding to `total_lines` → progress can overflow on a corrupt record. |

### D. API hardening

| ID | Sev | Location | Failure scenario |
|----|-----|----------|------------------|
| F-19 | 🔴 | `src/app/api/recordings/upload-url/route.ts:15-24`; `src/app/api/clips/[clipId]/attempts/upload-url/route.ts:19-25` | Presigned URL issued for any `scriptId`/`clipId` with no ownership check → storage-consumption DoS against arbitrary resources. Correct ownership pattern exists at `scenes/[sceneId]/download/route.ts:36`. |
| F-20 | 🟠 | same two routes (`…:24` / `…:25`) | Client-supplied `ext` used unsanitised in the storage key; no size limit. Correct pattern: `auditions/takes/[takeId]/clips/route.ts:67-69` (`sanitizeStorageFilename` + `inferExtension`). |
| F-21 | 🟢 | `src/app/api/rooms/route.ts:22-45` | On 10 room-code collisions the loop exits and inserts the collided code → generic 500 instead of a clean 503/retry. Not data corruption (DB unique constraint holds). |

### E. Tooling / process

| ID | Sev | Location | Detail |
|----|-----|----------|--------|
| F-14 | 🟠 | 9 files (lint output) | `npm run lint` is red: 5× `react-hooks/set-state-in-effect` (clips pages), 2× same in `rehearsal/loading-montage.tsx` & `montage-overlay-provider.tsx`, `prefer-const` in `clips/pipeline/analyze.ts:223`, plus unused-var warnings. CI has nothing to gate on today. |
| F-15 | 🟠 | repo-wide | No test infrastructure at all — zero automated safety net for any of the above regressions. |

## 3. Verified non-issues (checked, no action)

- **`recording_source` trust boundary** — never set from client input; only server code
  (`src/lib/generation/execute.ts:249`) sets `ai_generated`. Insert route
  (`src/app/api/recordings/route.ts:22-29`) doesn't read the field. ✅
- **Audition access control** — `getAuditionScriptAccessContext` and audition/take routes
  correctly gate on viewer relationships. ✅
- **Admin-only write routes** (`/api/clips` POST, `/api/access/users`, `/api/admin/*`)
  correctly gate on `isAdmin`. ✅

## 4. Severity roll-up

- 🔴 High: F-1..F-5, F-8, F-9, F-12, F-13, F-19 (10)
- 🟠 Medium: F-6, F-7, F-10, F-11, F-16, F-17, F-20, F-14, F-15 (9)
- 🟢 Low: F-18, F-21 (2)

See `findings-analysis.md` for lane assignment.

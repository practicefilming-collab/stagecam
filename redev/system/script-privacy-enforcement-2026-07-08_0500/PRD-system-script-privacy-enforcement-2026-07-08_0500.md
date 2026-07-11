# PRD: Script Privacy Enforcement (defense-in-depth for `is_internal`)

**Author:** redev session 2026-07-08_0500
**Type:** System / Permissions & Data Access
**Status:** Draft
**Source:** `redev/system/full-audit-2026-07-08_0500/` (findings F-3, F-4, F-5, F-6, F-7)
**Related:** quick-fix `redev/quick-fixes/website/stage/create/2026-07-08_0500/` (F-1, F-2, UI layer)

## 1. Background

Audition-derived scripts are marked `is_internal = true` (migration `019`;
`src/lib/auditions/processing.ts:511`) and are meant to be private. Only
`src/app/api/scripts/route.ts:20,28` enforces `.eq('is_internal', false)`. The audit found
the guard missing everywhere else, forming a read → persist → re-read chain that exposes
private script content even after the create-stage UI is filtered (the quick-fix). The UI
fix alone is insufficient because a caller who knows a private `script_id` bypasses it via
the room API.

## 2. Current implementation

- **Correct reference:** `src/app/api/scripts/route.ts` filters `is_internal=false` on both
  list and slug lookups.
- **Gaps (all confirmed):**
  - `src/app/api/rooms/route.ts:34-59` (POST) — accepts arbitrary `script_id`, no privacy check.
  - `src/app/api/rooms/[roomId]/route.ts:33` (PATCH) — updates `script_id`, no check.
  - `src/app/api/rooms/route.ts:73-78` (GET `?code=`) — `.select('*, scripts(*)')` returns
    full private script to anyone with the room code (list endpoint at `:95` is already safe,
    selecting only `scripts(title, year)`).
  - `src/hooks/use-room.ts:28` — client hook loads `scripts.*` unfiltered.
  - `src/app/(protected)/stage/[roomCode]/rehearse/page.tsx:49-53` — rehearsal UI loads unfiltered.
- **RLS:** migration `001` RLS on `scripts` checks auth only, not `is_internal`, so app-layer
  enforcement is load-bearing today.

## 3. Proposed changes

### 3.1 Validate script privacy at the write boundary (primary fix)
In `POST /api/rooms` and `PATCH /api/rooms/[roomId]`, before binding a `script_id`, fetch the
script and reject when `is_internal !== false` (404/403). This makes it impossible to attach
a private script to a room regardless of client. Reuse the same predicate as `/api/scripts`.

### 3.2 Stop leaking full script objects on room reads
Narrow `GET /api/rooms?code=` to select only the script fields the room UI needs (mirror the
safe list endpoint at `:95`, e.g. `scripts(title, year, slug)`), never `scripts(*)`. Any
route that must return script bodies should route through the `is_internal`-filtered path.

### 3.3 Centralise the privacy predicate
Add a single reusable helper (e.g. `assertPublicScript(supabase, scriptId)` /
`publicScriptsQuery(supabase)`) in `src/lib/` and use it in `/api/scripts`, the room routes,
`use-room.ts`, and `rehearse/page.tsx` so the filter can't drift out of sync again. Consider
routing client script reads (`use-room.ts`, rehearse page) through the API instead of direct
Supabase queries.

### 3.4 (Recommended) RLS backstop
Add an RLS policy / column-aware view so `is_internal = true` rows are unreadable except to
authorised audition viewers — a database-level backstop so an app-layer miss can't leak
again. Coordinate with the audition access model (`src/lib/auditions/auth.ts`) so assigned
rehearsers retain access to their own internal scripts.

## 4. Rationale
Privacy of paid/professional audition material is a core product promise; a room-code URL
handing out full private scripts is the highest-severity item in the audit. Defense-in-depth
(write validation + read narrowing + optional RLS) ensures no single missed filter re-opens it.

## 5. Phases
1. Ship the quick-fix UI filters (F-1/F-2) — already approved, independent.
2. Write-boundary validation in room POST/PATCH (§3.1) + narrow room GET (§3.2).
3. Centralise predicate; convert client direct-reads to the guarded path (§3.3).
4. RLS backstop (§3.4).

## 6. Risks / dependencies
- Must not break assigned-rehearser access to their own internal scripts (audition flow).
- RLS change needs a migration + verification against existing audition relationships.
- Low regression risk to public scripts (`is_internal` defaults false).

## 7. Verification
- Attempt to POST/PATCH a room with a known `is_internal=true` id → rejected.
- `GET /api/rooms?code=` for such a room → no private body fields returned.
- Assigned rehearser can still load their own audition script; unrelated user cannot.
- Add regression tests once the testing-infrastructure PRD lands.

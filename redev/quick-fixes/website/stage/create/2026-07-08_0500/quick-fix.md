# Quick Fix: Private audition scripts appear in the create-stage picker

**Session:** 2026-07-08_0500 · **Lane:** quick-fixes/website · **Page:** stage/create (+ backstage picker)
**Source:** `redev/system/full-audit-2026-07-08_0500/` (findings F-1, F-2)

## Intake

From the audit trigger:
> although the audition scripts are supposed to be private they still show to be chosen on
> the main create-a-stage functionality

## Observed issue

Audition-derived scripts are marked `is_internal = true` (migration `019`,
`src/lib/auditions/processing.ts:511`). The canonical API filters them out
(`src/app/api/scripts/route.ts:20,28` → `.eq('is_internal', false)`), but two client pages
query the `scripts` table **directly with no filter**, so private scripts appear in the UI:

- `src/app/(protected)/stage/create/page.tsx:20-24`
- `src/app/(protected)/stage/[roomCode]/page.tsx:360-364` (backstage picker)

Both run:
```ts
const { data } = await supabase.from('scripts').select('*').order('rank', { ascending: true });
```

## Proposed quick fix

Add the existing privacy filter to both queries so they match `/api/scripts`:
```ts
const { data } = await supabase
  .from('scripts')
  .select('*')
  .eq('is_internal', false)
  .order('rank', { ascending: true });
```
(Equivalently, route both pages through `GET /api/scripts`, which already filters.)

## Confidence

**High** for closing the *visible* leak. The filter column exists, is populated, and the
exact pattern is already proven in `/api/scripts`. Two-line, additive change; no schema or
API change; no effect on public scripts (`is_internal = false` default, migration `019`).

## Critical analysis (reasons not to ship as-is)

1. **Is app-level filtering the right layer?** RLS on `scripts` (migration `001`) only checks
   authentication, not `is_internal`, so row-level filtering must happen in app code today.
   Adding the filter here is consistent with the current design. ✅
2. **Does this fully close the privacy hole?** **No.** The audit (F-3, F-4, F-5, F-6, F-7)
   found the leak is a broader attack chain: `/api/rooms` create/update accept a private
   `script_id` unvalidated, the room GET-by-code returns full private script content, and
   `use-room.ts` / the rehearse page load scripts unfiltered. A user who already knows a
   private id bypasses this UI fix entirely. → **data/API risk present.**

Per the quick-fix rule, discovered data/API risk means the *deeper enforcement* leaves the
quick-fix path. It has been **escalated to a system PRD**:
`prd-board/requests/PRD-system-script-privacy-enforcement-2026-07-08_0500`. This quick-fix is
scoped strictly to the two UI queries (F-1/F-2) as an immediate, safe first-layer mitigation
of the exact reported symptom; it does not claim to close the full hole.

## Decision

**approved for direct implementation** — for F-1/F-2 (the two UI query filters) only.
Full defense-in-depth (F-3..F-7) is handed to the escalated PRD above.

## Implementation notes

- Files: `src/app/(protected)/stage/create/page.tsx`, `src/app/(protected)/stage/[roomCode]/page.tsx`.
- After shipping, record commit hash(es) in `PUSHES.md` in this folder, with a
  `Quick-Fix: website/stage/create/2026-07-08_0500` reference in the commit body.

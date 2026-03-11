# PRD: /stage/[roomCode] Pick Mode — Post-Testing Bug Fixes

**Author**: redev session 2026-03-11
**Snapshots**: `photo_2_2026-03-11_01-43-43.jpg` through `photo_17_2026-03-11_01-43-43.jpg`
**Status**: Committed
**Implementation hash**: (pending commit)

---

## 1. Background

Testing the pick mode browse axes (implemented from `PRD-stage-roomCode-2026-03-10_2325.md`) in room JEBBS9 revealed bugs around narrator-only scenes and display issues. Screenshots and critical analysis are in this directory.

**Research chain**:
- [`critical-analysis.md`](./critical-analysis.md) — screenshot review, issue identification, severity ranking

---

## 2. Issues Found

### Issue 1: "0 characters" label in Length mode (P1)
Scene 8 (narrator-only) shows "0 characters" in Length sub-mode — technically correct but unhelpful.

### Issue 2: "No lines assigned" dead end (P0)
Solo user on narrator-only scene can start rehearsal without claiming Narrator, leading to "No lines assigned to you" dead end.

### Issue 3: Scene 8 "0 lines" vs "3 rehearsable lines" inconsistency (P1)
Scene card shows "0 lines" but callsheet shows "3 rehearsable lines" — stale `rehearsable_chunks` value from earlier seed run.

### Issue 4: "0 narrators" in Group Size mode (P1)
When a scene perfectly fits the group size (0 narrators needed), showing "0 narrators" wastes the opportunity to signal a perfect fit.

---

## 3. Fixes

### Fix 1: Label narrator-only scenes in Length mode
**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

When `charStats.length === 0`, show `narrator only` instead of `0 characters`.

### Fix 2: Solo narrator auto-assign + group start guard
**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

**Part A — Derived state**: Add `isNarratorOnly` and `isSoloNarrator` flags. Include `isSoloNarrator` in `hasRole` check so a solo user on a narrator-only scene can Ready and Start without explicit Narrator claim.

**Part B — Block start for groups with 0 claims**: When `participants.length > 1 && roleClaims.size === 0 && !isNarratorOnly`, disable the Start button and show "At least one person must claim a role". Narrator-only scenes with groups are not blocked — unclaimed narrator lines auto-distribute to all participants via `line-distributor.ts`.

### Fix 3: Re-seed to fix rehearsable_chunks
**File**: `supabase/seed/seed.ts` (no code changes — re-run only)

Scene 8's `rehearsable_chunks = 0` is stale data from an earlier seed run. The seed pipeline computes it correctly using `isSystemChunk()`. Re-running fixes it.

### Fix 4: "Perfect fit" tag in Group Size mode
**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

When `entry.narrators === 0`, show a gold "perfect fit" badge instead of "0 narrators".

---

## 4. Files Modified

| File | Fixes |
|------|-------|
| `src/app/(protected)/stage/[roomCode]/page.tsx` | 1, 2, 4 |
| `supabase/seed/seed.ts` | 3 (re-run only, no code change) |

---

## 5. Existing Code Reused

- `preview.characters` — already available in callsheet stage
- `roleClaims` Map — already tracks all user claims via broadcast
- `participants` from `usePresence` — already tracks room members
- `line-distributor.ts` line 72 — users without characters get action lines round-robin (no change needed)

---

## 6. Verification

1. `npm run build` — must pass
2. Re-seed: `npx tsx supabase/seed/seed.ts`
3. Dev test in Pick mode:
   - **Length → Spark**: Scene 8 shows "narrator only" instead of "0 characters"
   - **Group Size → 3**: Scenes with 0 narrators show gold "perfect fit" tag
   - **Solo + narrator-only scene**: Can Ready + Start without explicit Narrator claim → rehearsal loads with action lines assigned
   - **Group (2+ people) + no claims**: Start button disabled with red warning message

---

## 7. Out of Scope (deferred)

| Item | Reason |
|------|--------|
| Narrator tracking in stats/admin stats | Separate effort (data layer already tracks it) |
| "next week!!" parsing artifact | Seed pipeline data quality pass |
| Sticky confirm button | Not a priority |
| Group size "1" option | Not needed; solo users have other axes |

# APPROVED

**Approved**: 2026-03-12T00:00:00Z
**PRD**: PRD-stage-roomCode-2026-03-11_2337
**Title**: Scene Card Line Count Accuracy & Solo Start Flow

---

## Alignment Assessment

### 1. Commit Conflicts

**Overlap with recently shipped work — manageable.**

Commits `66b4f45` (Fix scene picker rehearsable counts), `864fb4f` (Refine scene line breakdown labels), and `709f2f8` (Align length picker counts with participant fit) all shipped under the previous PRD (`2026-03-11_2224`) targeting the same symptom: scene cards showing wrong line counts. That PRD's COMMITS.md marks Reqs 1–3 as addressed.

However, the 7J78W2 screenshots (taken at 23:37, after those commits) still show "0 lines" on Spark scenes. This PRD diagnoses a **different root cause** — a race condition where the `sceneLineBreakdowns` async query hasn't resolved before the scene list renders, causing fallback to the stale `scenes.rehearsable_chunks` column. The previous fixes corrected the computation but not the timing. This is a legitimate remaining defect, not a duplicate.

Fix 4 (solo auto-claim) is new work with no commit conflicts.

### 2. Queue Conflicts

**None.** Requests queue is empty.

### 3. Direction Alignment

**Aligned.** The last 6 commits on `page.tsx` are all hardening the Pick mode scene selection experience. This PRD continues that trajectory by closing the remaining gap between scene card display and callsheet reality. The solo auto-claim (Fix 4) is a natural follow-on from the role-claiming flow shipped in `5a86c06` and `9169c06`.

### 4. Dependency Order

**No blockers.** No queued PRDs exist. The 2224 PRD's implementation is already committed, and this PRD builds on top of it.

---

## Conditions

1. **Verify the race condition theory before implementing Fix 1.** Add a `console.log` or breakpoint to confirm `sceneLineBreakdowns` is indeed empty when the scene list first renders in Pick mode. If the data is present but wrong, the fix is different (data computation, not loading guard).

2. **Fix 4 (solo auto-claim) must not fire on re-renders.** The `useEffect` should guard against re-claiming if the user has already unclaimed/released a role intentionally. Consider checking `roleClaims.size === 0` is true because no claim has been made yet, not because the user released one.

---

## Summary

Approved for implementation. Two fixes: a loading guard to prevent stale fallback line counts on scene cards (P0), and solo auto-claim for single-character scenes (P2). Both are scoped to `page.tsx` with no API or schema changes.

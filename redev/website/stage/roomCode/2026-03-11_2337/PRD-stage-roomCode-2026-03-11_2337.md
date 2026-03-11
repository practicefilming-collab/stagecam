# PRD: /stage/[roomCode] — Scene Card Line Count Accuracy & Solo Start Flow

**Author**: redev session 2026-03-11
**Snapshots**: `photo_1_2026-03-11_23-37-34.jpg`, `photo_2_2026-03-11_23-37-34.jpg`
**Status**: Draft

---

## 1. Background

Testing the Pick → Call Sheet flow in room 7J78W2 (@Mr_Ridley, solo, Toy Story) revealed that scene cards in Length > Spark mode display "0 lines" for all scenes, while the Call Sheet after confirming Scene 7 shows 8 rehearsable lines. This is the same class of bug flagged in the JEBBS9 session (`PRD-stage-roomCode-2026-03-11_0128.md`, Issue #3) — that PRD's Fix #3 called for a re-seed, but the display inconsistency persists.

The root cause is not stale seed data — the `sceneLineBreakdowns` query (lines 210–237) fetches live from the `chunks` table and correctly computes per-scene counts. The problem is that the breakdown query may not have resolved before the Pick mode scene list renders, causing the fallback `getSceneRehearsableLines(scene)` to return `scene.rehearsable_chunks` which is 0 in the DB for these scenes.

**Research chain**:
- [`similarities-comparison.md`](./similarities-comparison.md) — screenshot relationship
- [`critical-analysis.md`](./critical-analysis.md) — issue identification, severity ranking

---

## 2. Issues & Fixes

### Issue 1: Scene cards show "0 lines" when actual rehearsable count is > 0

**Severity: P0 — makes Spark filter appear empty/useless**

Scene 7 card shows "0 lines" (photo_1) but Call Sheet shows "8 rehearsable lines" (photo_2). All three Spark scenes (7, 8, 9) show 0.

**Root cause**: Two code paths compute rehearsable lines independently:
- **Scene card** (line 947): `sceneLineBreakdowns[scene.id]?.rehearsableLines ?? getSceneRehearsableLines(scene)`
- **Call Sheet** (preview API): `totalLines` from matchmaking pipeline counting actual `chunks` rows

The fallback `getSceneRehearsableLines(scene)` uses `scene.rehearsable_chunks` from the `scenes` table — a static column that was 0 for these scenes from seeding. If `sceneLineBreakdowns` hasn't loaded yet (async query at lines 210–212), every card falls back to 0.

**Fix**: Ensure scene list does not render Pick mode results until `sceneLineBreakdowns` has loaded. Add a loading guard.

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

**Change A — Track loading state**:
Add `sceneLineBreakdownsLoaded` boolean state. Set it to `true` after the breakdown query completes (after line 236). Default to `false`.

**Change B — Guard Pick mode scene list**:
In `getPickScenes()` (line 637), return empty array if `!sceneLineBreakdownsLoaded` for `length`, `character`, and `group-size` modes. The `act-scene` mode can skip this since it doesn't rely on breakdowns for filtering.

**Change C — Show loading indicator**:
When `!sceneLineBreakdownsLoaded && pickMode !== 'act-scene'`, render a brief "Loading scenes..." message instead of an empty or misleading scene list.

### Issue 2: "0 rehearsable lines" contradicts "1 participant · 1 speaking"

**Severity: P1 — contradictory metadata erodes trust**

Scene 7 shows `0 rehearsable lines` alongside `1 participant · 1 speaking`. If there are 0 lines, how can there be a speaking character?

**Root cause**: The participant/speaking/narrator counts come from `getRollCallEntryForParticipants()` which reads `scene.roll_calls` JSONB — populated correctly during seeding. But the line count falls back to the stale `rehearsable_chunks = 0`.

**Fix**: This is a consequence of Issue 1. Once `sceneLineBreakdowns` is guaranteed loaded before rendering (Fix 1), the line count will be accurate (8 lines) and the contradiction disappears.

No additional code change needed — Fix 1 resolves this.

### Issue 3: Narrator-only Scene 8 still appears in Spark without guard

**Severity: P1 — known dead-end path still present**

Scene 8 (INT. DOWNSTAIRS HALLWAY - CONTINUOUS) shows `0 speaking · 1 narrator`. If selected by a solo user who doesn't claim Narrator, this leads to the "No lines assigned" dead end documented in JEBBS9.

The JEBBS9 PRD implemented `isSoloNarrator` auto-ready (line 178) so a solo user on a narrator-only scene can start without explicitly claiming. But the scene card still shows misleading "0 lines" making it look empty.

**Fix**: Already addressed by Fix 1 (accurate line count display). Once loaded, Scene 8 will show its actual rehearsable line count (3 narration lines) and the card will show `3 narration` in the breakdown text. Combined with the existing `narrator only` label (line 1033), this gives the user enough signal.

No additional code change needed beyond Fix 1.

### Issue 4: Solo user must manually claim or rely on auto-assign ambiguity

**Severity: P2 — friction for solo users**

Photo_2 shows "1 role unclaimed — will be auto-assigned" and "Select at least one role to ready up". The `isSoloNarrator` path handles narrator-only scenes, but for scenes with characters (like Scene 7 with MRS. DAVIS), a solo user still needs to manually claim.

**Fix**: Auto-claim the sole character role when a solo user confirms a scene with exactly 1 character.

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

**Change**: After preview loads and `participants.length === 1 && preview.characters.length === 1 && roleClaims.size === 0`, automatically call `claimRole(preview.characters[0].name)`. This eliminates the extra tap for the most common solo scenario.

Add the auto-claim inside the existing `useEffect` that watches `preview` state, or as a new effect:

```typescript
useEffect(() => {
  if (
    preview &&
    participants.length === 1 &&
    preview.characters.length === 1 &&
    roleClaims.size === 0
  ) {
    claimRole(preview.characters[0].name);
  }
}, [preview, participants.length]);
```

---

## 3. Files Modified

| File | Fixes |
|------|-------|
| `src/app/(protected)/stage/[roomCode]/page.tsx` | 1, 4 |

---

## 4. Existing Code Reused

- `sceneLineBreakdowns` state + query (lines 210–237) — already computes correct counts
- `getPickScenes()` (line 637) — already uses breakdowns when available
- `isSoloNarrator` (line 178) — already handles narrator-only solo path
- `claimRole()` — existing broadcast-based role claim function

---

## 5. Verification

1. `npm run build` — must pass
2. Dev test in Pick mode (solo, Toy Story):
   - **Length → Spark**: Scene cards show actual line counts (not 0), with breakdown (e.g., "1 dialogue + 7 narration")
   - **Briefly shows "Loading scenes..."** before breakdowns resolve, then scene list populates
   - **Scene 7 card**: Line count matches Call Sheet (8 rehearsable lines)
   - **Scene 8 card**: Shows narration line count + "narrator only" label
   - **Confirm Scene 7 (solo)**: MRS. DAVIS auto-claimed, user lands on Call Sheet already holding a role
   - **Start Rehearsal**: Works without manual claim step

---

## 6. Out of Scope

| Item | Reason |
|------|--------|
| Re-seed to fix `scenes.rehearsable_chunks` column | The live `chunks` query in `sceneLineBreakdowns` is the source of truth; fixing the static column is a data hygiene task, not a blocker |
| Multi-user auto-assign logic | Only solo auto-claim is addressed; group scenarios are more complex |
| Cross-filtering (e.g., Spark + solo-friendly) | Separate feature; sub-modes remain independent |
| Start button disable for solo with no claim | Resolved by auto-claim (Fix 4); no need for separate guard |

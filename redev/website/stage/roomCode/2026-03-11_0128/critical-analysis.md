# /stage/[roomCode] Pick Mode Browse Axes — Critical Analysis

**Snapshot**: `photo_2_2026-03-11_01-43-43.jpg` through `photo_17_2026-03-11_01-43-43.jpg`
**Room**: JEBBS9, Toy Story (1995), 1 participant (Incognito)
**Date**: 2026-03-11 01:28–01:40
**State captured**: Pick mode with all four browse axes exercised, ending with a rehearsal attempt on a narrator-only scene

**Previous PRD**: This is a testing session for the pick mode browse axes implemented from `redev/stage/roomCode/2026-03-10_2325/PRD-stage-roomCode-2026-03-10_2325.md`.

---

## Screenshot Sequence

| Photo | Time | State | Description |
|-------|------|-------|-------------|
| 2 | 01:28 | Pick → Group Size → 2 | 4 scenes shown: Scenes 3, 4, 6, 11 |
| 3 | 01:28 | Pick → Group Size → 2 (scrolled) | More scenes: 11, 12, 14, 16, 18 |
| 4 | 01:28 | Pick → Group Size → 2 (scrolled) | Scenes 19, 22, 23, 24 (88 lines) |
| 5 | 01:29 | Pick → Character | Full character pill list (Alien → Wounded Soldier) |
| 6 | 01:31 | Pick → Group Size → 3 | 4 scenes: 4, 6, 14, 16 |
| 7 | 01:31 | Pick → Group Size → 4 | Same 4 scenes as group size 3 |
| 8 | 01:31 | Pick → Group Size → 5 | 4 scenes: 4, 6, 22, 24 |
| 9 | 01:31 | Pick → Group Size → 6 | 4 scenes: 4, 6, 24, 28 |
| 10 | 01:31 | Pick → Group Size → 7+ | Same as 6: Scenes 4, 6, 24, 28 |
| 11 | 01:32 | Pick → Length → Beat (selected) | Scene 8 highlighted gold border: "0 lines, 0 characters" |
| 12 | 01:39 | Pick → Length → Spark (selected) | Same view, Spark active, Scene 8 still highlighted |
| 13 | 01:39 | Pick → Length → Spark | Scene 8 highlighted again, identical to 12 |
| 14 | 01:39 | Callsheet (Scene 8 confirmed) | "3 rehearsable lines", only "+ Narrator 3 lines" available |
| 15 | 01:40 | Callsheet → "Starting..." | User hit Start without claiming Narrator |
| 16 | 01:40 | Rehearsal loading | "Loading rehearsal..." screen |
| 17 | 01:40 | Rehearsal dead end | "No lines assigned to you for this session." + "Back to Menu" |

---

## What's Working

### 1. Browse Axis Pill Row

The four sub-mode pills (Length | Character | Group Size | Act/Scene) render correctly under the Auto/Pick toggle. The active pill uses gold border + gold text, inactive pills use muted border. The visual hierarchy is clear — the user knows which axis they're browsing.

**Pill order matches the PRD**: Length first (most accessible), Act/Scene last (requires script knowledge). Good.

### 2. Group Size Filtering

Scenes filter correctly by participant count. The data from `roll_calls` is working:
- **2 people**: 12+ scenes (many 2-character scenes in Toy Story)
- **3 people**: 4 scenes — correctly narrows as group size increases
- **5–7+**: Converges to the largest ensemble scenes (4, 6, 24, 28)

Each scene card shows `N speaking · M narrators`, which is exactly the fit-quality info the PRD specified. Scenes are visibly sorted with fewer narrators first (better fit).

### 3. Character Axis

All ~50 Toy Story characters rendered as pill buttons. Alphabetically sorted. Scrollable. The full character list is legible and tappable on mobile. No truncation issues visible.

### 4. Scene Cards

Scene cards display consistently across all sub-modes: scene number, heading in bold, line count right-aligned, context row below (speaking/narrators for group size, character line counts for character mode). Good information density without clutter.

---

## Critical Issues

### Issue 1: Scene 8 "0 lines, 0 characters" is selectable in Length mode

**Severity: High — leads to dead end**

Photos 11-13 show Scene 8 "INT. DOWNSTAIRS HALLWAY - CONTINUOUS" appearing in the Length/Spark and Length/Beat filtered lists with **"0 lines"** and **"0 characters"**. It has a gold highlight border (selected state) and the user can tap "Confirm Scene" on it.

**Root cause**: The Length filtering logic (`getPickScenes()`) checks:
```typescript
const maxDialogue = Math.max(...scene.character_stats.map(c => c.dialogue_chunks), 0);
const rehearsable = scene.rehearsable_chunks;
return maxDialogue <= threshold.maxDialoguePerChar && rehearsable <= threshold.maxRehearsable;
```

A scene with 0 dialogue and 0 rehearsable chunks satisfies `0 <= 2` (Spark) and `0 <= 5` (Beat). It passes the filter because the thresholds are upper bounds with no lower bound.

**What happens next**: After confirming Scene 8, the preview API calls `runMatchmaking()`. The matchmaking code has a guard: `if (!lineRows || lineRows.length === 0) throw new Error('No lines in scene')`. But photos 14 shows the callsheet *did* generate with "3 rehearsable lines" — meaning Scene 8 does have lines in the DB, they're just not dialogue lines. The `character_stats` array is empty (0 characters) but action lines exist.

**The real problem**: Scene 8 has action lines only (all narrator material, no dialogue). In the Length filter, showing "0 lines" is misleading — it has 3 rehearsable lines but 0 *dialogue* lines. The "0 lines" display likely comes from showing `rehearsable_chunks` where the DB value might be 0 due to how it was computed (possibly only counting dialogue), or the scene card is displaying the wrong field.

**Fix needed**:
- **Filter**: Add a minimum threshold — scenes with 0 rehearsable lines should not appear in Length results. `rehearsable > 0` guard.
- **Display**: If the scene has rehearsable lines but 0 dialogue, show "3 lines (narrator only)" instead of "0 lines".
- **Or**: Exclude scenes with 0 characters from Length mode entirely — Length mode's tiers are defined by "dialogue lines per character", which is undefined when there are no characters.

### Issue 2: "No lines assigned" dead end after starting without a role

**Severity: High — broken user flow**

Photos 14-17 show the full failure path:
1. Scene 8 confirmed → callsheet shows "+ Narrator 3 lines" with "Claim" button
2. User does NOT claim Narrator
3. Message shown: "Select at least one role to ready up"
4. User hits "Start Rehearsal (0/1 ready)" anyway (creator can override)
5. "Starting..." → "Loading rehearsal..." → **"No lines assigned to you for this session."**

**Root cause**: The creator can start rehearsal even when they haven't claimed a role. The `startSession()` function builds `roleDraft` from `roleClaims`, which is empty. The matchmaking auto-assigns unclaimed characters — but Scene 8 has **no characters**. The only available role is Narrator, which is opt-in. Since nobody opted in, the line distributor has no dialogue to assign, and the action lines go to... nobody? Or they get distributed but the rehearsal page doesn't recognize action-only assignments.

Looking at the code: `assignCharacters()` receives an empty `roleDraft` and an empty character list. It returns empty assignments. Then `distributeLines()` assigns action lines, but the user who starts may not receive them if the narrator assignment logic requires explicit opt-in.

**Fix options**:
- **A) Prevent start with no roles claimed**: Disable "Start Rehearsal" when no participants have claimed any role AND no characters exist to auto-assign. Show: "At least one person must claim the Narrator role."
- **B) Auto-assign narrator to sole participant**: If there's 1 participant and only narrator lines exist, automatically assign all action lines to them without requiring explicit opt-in.
- **C) Both**: Auto-assign for solo, require claim for groups.

### Issue 3: Scene 8 shows "0 lines" in scene card but "3 rehearsable lines" on callsheet

**Severity: Medium — data inconsistency confuses users**

The scene card in the Length list says "0 lines" (photos 11-13), but after confirming, the callsheet says "3 rehearsable lines" (photo 14). These are the same scene. The user sees contradictory information.

**Root cause**: The scene card likely displays `rehearsable_chunks` from the scene record (which may be 0 if it was computed differently), while the callsheet's "3 rehearsable lines" comes from the matchmaking pipeline counting actual non-system lines from the `chunks` table at runtime.

Alternatively, the scene card might be showing the dialogue-only count (0) while the callsheet shows the total rehearsable count including action lines (3).

**Fix**: Ensure the scene card in all browse modes shows the same `totalLines` (rehearsable, non-system) that the callsheet will display. The number must match end-to-end.

### Issue 4: Length mode "0 characters" display

**Severity: Medium — confusing UI**

Photos 11-13 show scene cards in Length mode displaying `0 characters` with character context info. In the Length sub-mode, the PRD specified showing "character count, lines per character breakdown." When there are 0 characters, showing "0 characters" is technically correct but unhelpful. It should show "narrator only" or similar.

Scene 10 "INT. DOWNSTAIRS HALLWAY" also shows `1 character · MRS. DAVIS: 2` which is useful. But Scene 8 showing `0 characters` gives no signal about what the scene contains.

---

## Minor Issues

### Issue 5: Group Size 3 and 4 show identical results

**Severity: Low — expected behavior, but feels odd**

Photos 6 and 7 show the exact same 4 scenes (4, 6, 14, 16) for both group sizes 3 and 4. This is correct — those scenes have enough characters that both 3 and 4 participants work. But the user switching between 3 and 4 and seeing no change might think the filter is broken.

**Possible enhancement**: Show per-scene how the fit changes — e.g., "3 speaking · 0 narrators" for size 3 vs "3 speaking · 1 narrator" for size 4. The current display already does this, so this may just need the user to notice. No fix needed.

### Issue 6: Group Size axis doesn't show "1" option

**Severity: Low — intentional but limiting for solo users**

The group size selector starts at 2 (photos 2-10). This is reasonable since rehearsal is fundamentally collaborative, but the user in this session *is* solo (Cast shows 1 participant). A solo user in Pick mode has no way to browse "scenes I can do alone" via Group Size.

**Context**: Auto mode handles solo differently. In Pick mode, a solo user should probably use Length or Character instead. Not a bug, but worth noting.

### Issue 7: Scene 6 heading is "next week!!" — likely a parsing artifact

**Severity: Low — data quality**

Scene 6 appears across multiple group sizes with the heading "next week!!" (lowercase, double exclamation). This doesn't match the standard scene heading format (`INT./EXT. LOCATION`). It may be a scene heading that was incorrectly parsed from the script, or an actual unconventional heading in the Toy Story script.

Not a UI bug — this is a seed data quality issue in the parsing pipeline.

### Issue 8: Confirm Scene button position

**Severity: Low — partially addressed**

The Confirm Scene button appears at the bottom of the scene selection card (photos 2-4, 6-13). It's visible in most screenshots without scrolling, which suggests the `max-h` increase from the PRD helped. However, in photos with longer scene lists, the button might still require scrolling. The PRD called for `sticky bottom-0` but it's unclear from screenshots whether this was implemented.

"Generates call sheet and assigns roles" helper text is visible below the button (photo 6) — that PRD item was implemented.

---

## Observations on Pick Mode as Implemented vs. PRD

| PRD Spec | Status | Notes |
|----------|--------|-------|
| 4 sub-mode pills (Length, Character, Group Size, Act/Scene) | Implemented | Correct order, correct styling |
| Length tiers: Spark / Beat / Moment | Implemented | Thresholds working per screenshots |
| Character pill list | Implemented | Full character list displayed |
| Group Size 2-7+ | Implemented | Filtering working correctly |
| Scene card context rows per sub-mode | Implemented | Speaking/narrators for Group Size, character lines for Character |
| Sticky confirm button | Unclear | Can't confirm from static screenshots |
| Max-h increase | Likely implemented | More scenes visible per scroll |
| "chunks" → "lines" in scene cards | Partially done | Group Size cards say "lines" correctly; Length cards say "lines" |
| Confirm disabled without scene selected | Unclear | Can't confirm from screenshots (a scene is always selected) |

---

## Summary: Priority Ranking

| Priority | Issue | Severity | User Impact |
|----------|-------|----------|-------------|
| **P0** | #2: "No lines assigned" dead end | High | Complete flow breakage — user is dumped to unrecoverable state |
| **P0** | #1: 0-line scenes selectable in Length mode | High | Leads directly to Issue #2; even if #2 is fixed, selecting an empty scene is confusing |
| **P1** | #3: Scene card shows "0 lines" but callsheet shows "3 lines" | Medium | Contradictory numbers erode trust |
| **P1** | #4: "0 characters" display in Length mode | Medium | Unhelpful label; should indicate narrator-only |
| **P2** | #8: Confirm button stickiness | Low | Minor scroll inconvenience |
| **P2** | #5: Identical results for Group Size 3 and 4 | Low | Expected behavior, no fix needed |
| **P3** | #6: No group size "1" option | Low | Solo users have other axes |
| **P3** | #7: "next week!!" heading | Low | Seed data quality, not UI |

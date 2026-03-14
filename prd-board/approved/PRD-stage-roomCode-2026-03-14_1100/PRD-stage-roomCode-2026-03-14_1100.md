# PRD: /stage/[roomCode] — Pick Mode Scene Card & Sort Refinements

**Author**: Implementation-driven refinements (no originating redev session)
**Date**: 2026-03-14
**Status**: Draft

---

## 1. Background

After shipping PRD-stage-roomCode-2026-03-11_2337 (loading guard + solo auto-claim) and PRD-stage-roomCode-2026-03-10_2325 (pick mode browse axes), several UX gaps became apparent during implementation and manual testing:

- Scene cards mix "rehearsable lines" (user-recordable) with metadata about system lines, but the card never shows system/direction lines — making the total appear lower than the actual scene length
- The "narration" label conflates stage directions (system TTS) with action lines (user-performed non-dialogue) — these are distinct line types with different assignment behavior
- Group-size sorting treats all 0-narrator scenes identically, so groups of 3, 4, and 5 see the same top results
- Character mode sorts by line count descending, but users scanning for a character want to find scenes in script order
- Length mode inline thresholds are duplicated logic that could diverge

These are refinements to already-shipped pick mode features, not new functionality.

---

## 2. Changes

### Change 1: Line breakdown — narration → action + direction

**What**: Split `SceneLineBreakdown.narrationLines` into `actionLines` (non-dialogue rehearsable) and `directionLines` (system/TTS lines).

**Why**: "Narration" is ambiguous. Action lines are user-performed and count toward coverage. Direction lines are system TTS and never assigned. Distinguishing them lets the scene card show total scene length (dialogue + action + direction) instead of just rehearsable count, giving creators a fuller picture.

**Scope**:
- `SceneLineBreakdown` interface: replace `narrationLines` with `actionLines` + `directionLines`
- Breakdown computation: system chunks increment `directionLines`, non-dialogue non-system increment `actionLines`
- Scene card display: show `totalLines` (all three summed), breakdown text shows "X dialogue + Y action + Z direction"
- `getSceneNarrationLines` helper: return `actionLines` instead of `narrationLines`

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

### Change 2: Unified scene card context row

**What**: Replace mode-specific context rows (character lines for character mode, participant/speaking/narrator for group-size and length modes, character list for act-scene mode) with a single consistent row: `{charCount} character(s) · {dialogue summary}`.

**Why**: The mode-specific rows were noisy and inconsistent. A user comparing scenes across modes would see different metadata emphasis. The unified row gives consistent context — character count and dialogue distribution — regardless of how the user found the scene. The mode-specific filtering already provides the relevant context (e.g., being in group-size mode with "3" selected).

**Scope**:
- Remove mode-branching in scene card context row
- Remove `getRollCallEntryForParticipants` helper (no longer used)
- Single context row using `summarizeCharacterDialogueLines(charStats)`

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

### Change 3: Group-size multi-factor sort

**What**: Replace single-key sort (narrators ascending) with three-factor sort: narrators → character-count distance from group size → actions per narrator.

**Why**: A scene with 10 characters has 0 narrators for groups 3, 4, and 5 — so all group sizes see the same top results. Adding character-count distance as tiebreaker means a 3-character scene ranks higher for group 3, while a 5-character scene ranks higher for group 5. The tertiary sort (actionsPerNarrator) differentiates scenes where narrators have meaningful work.

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

### Change 4: Character mode — sort by scene order

**What**: Sort character-filtered scenes by `scene_number` ascending instead of line count descending.

**Why**: When browsing scenes for a specific character, script order is more useful than "most lines first". Users want to see where the character appears in the story. The filter already removes scenes without the character — no need to also rank by prominence.

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

### Change 5: Length tier classifier extraction

**What**: Extract inline threshold checks into `classifyLengthTier(maxDialogue, rehearsableLines)` helper. Add sort by rehearsable lines ascending within each tier.

**Why**: The threshold logic was inline in the filter, making it harder to reuse or verify. Extracting it makes the classification testable. Sorting by line count within a tier puts shortest scenes first, matching the "spark < beat < moment" mental model.

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

### Change 6: Auto-scroll to scene list on character selection

**What**: When a character chip is tapped, scroll the scene list into view.

**Why**: On mobile, the character chip bar can push the scene list below the fold. After tapping a character, the user wants to see the results immediately.

**Scope**: Add `useRef` on scene list container, `scrollIntoView` on character chip click.

**File**: `src/app/(protected)/stage/[roomCode]/page.tsx`

---

## 3. Files Modified

| File | Changes |
|------|---------|
| `src/app/(protected)/stage/[roomCode]/page.tsx` | All changes (1–6) |

---

## 4. Seed Tooling Changes (Operational)

Two seed tooling fixes are included but are operational, not product changes:

| File | Change | Why |
|------|--------|-----|
| `supabase/seed/parse-chunks.ts` | Normalize Windows CRLF line endings; switch from split-based to regex-based frontmatter parsing | Fixes parse failures on Windows where `\r\n` breaks YAML delimiter matching |
| `supabase/seed/seed.ts` | Rename `performable_chunks` → `rehearsable_chunks` in insert; add optional CLI filter argument | Aligns seed column name with codebase terminology; allows re-seeding a single script |

---

## 5. Existing Code Reused

- `sceneLineBreakdowns` state + query — already computes per-scene chunk counts
- `summarizeCharacterDialogueLines()` from `line-helpers.ts` — already formats dialogue distribution
- `RollCallEntry.actionsPerNarrator` — already computed and stored in `roll_calls` JSONB
- `computeRollCalls` filtering — already excludes scenes without enough lines for a group size

---

## 6. Verification

1. `npm run build` — must pass (confirmed)
2. Manual test in Pick mode:
   - **Group size**: select 3, 4, 5 — verify top scenes differ for each
   - **Character**: select a character — verify scenes appear in script order
   - **Length > Spark**: verify scene cards show actual line counts with action/direction breakdown
   - **Mobile**: tap character chip — verify scene list scrolls into view

---

## 7. Implementation Order

| Phase | Scope | Files | Risk |
|-------|-------|-------|------|
| 1 | Line breakdown refactor (narration → action + direction) + unified context row | `page.tsx` | Low — display-only, no API/schema changes |
| 2 | Character sort + length tier classifier + auto-scroll | `page.tsx` | Low — sort/filter changes, no data changes |
| 3 | Group-size multi-factor sort | `page.tsx` | Low — sort-only change |
| 4 | Seed tooling fixes | `parse-chunks.ts`, `seed.ts` | Low — tooling only, does not affect production |

---

## 8. Out of Scope

| Item | Reason |
|------|--------|
| Updating `scenes.rehearsable_chunks` column in DB | The live `chunks` query is the source of truth; static column is a data hygiene task |
| Cross-filtering (e.g., Spark + group size 3) | Separate feature, sub-modes remain independent |
| Persisting sort preferences | No user signal that this is wanted |
| Redev session 2026-03-12_0946 | Superseded by commit `2f56d2a` (PRD-stage-roomCode-2026-03-11_2337 Fix 1) |

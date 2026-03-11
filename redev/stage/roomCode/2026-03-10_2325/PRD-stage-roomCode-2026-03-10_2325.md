# PRD: /stage/[roomCode] Pick Mode — Multiple Browse Axes

**Author**: redev session 2026-03-10
**Snapshot**: `photo_2026-03-10_23-25-01.jpg`
**Status**: Draft

---

## 1. Background

The Backstage page's Pick mode currently only lets users browse scenes by Act/Scene — a script-structural view that assumes familiarity with the script. This misses the most common user intents: playing a specific character, matching group size, or just doing something quick.

This PRD expands Pick into four independent sub-modes, all built on existing seeded data with no DB migrations.

**Research chain**:
- [`critical-analysis.md`](./critical-analysis.md) — screenshot review, sub-mode proposals, threshold calibration

---

## 2. Current Implementation

### Source Files

| File | Role |
|------|------|
| `src/app/(protected)/stage/[roomCode]/page.tsx` | Main Backstage page (all UI changes here) |
| `src/lib/types.ts` | Scene, Act types with `character_stats`, `roll_calls`, `unique_characters` |
| `src/lib/matchmaking/scene-selector.ts` | Existing scene scoring logic (reference for group size fit) |
| `src/lib/matchmaking/roll-call.ts` | Roll call computation (reference for group size) |

### Current Pick Mode

- Single browse axis: Act/Scene filter pills + scrollable scene list
- Scene items show: heading, chunk count (mislabeled "chunks"), character names
- Known bugs: confirm button disabled logic, "1 chunks" grammar, `max-h-48` too short

### Data Already Available (No DB Changes)

| Field | Type | Used By |
|-------|------|---------|
| `scenes.unique_characters` | `string[]` | Character sub-mode |
| `scenes.character_stats` | JSONB: `{ name, dialogue_chunks, total_chunks }[]` | Character + Length sub-modes |
| `scenes.roll_calls` | JSONB: `{ participants, characters, narrators, actionsPerNarrator }[]` | Group Size sub-mode |
| `scenes.rehearsable_chunks` | `number` | Length sub-mode thresholds |

---

## 3. Changes

### 3.1 Bug Fixes on Existing By Act/Scene Mode

**Confirm button disabled logic**: Change `!selectedSceneId && !selectedActId` to `!selectedSceneId` in pick mode. Currently the button enables when an act filter is selected but no scene is picked.

**Grammar fix**: "1 chunks" → "1 line" (singular). Replace "chunks" → "lines" in scene list labels.

---

### 3.2 Pick Sub-Mode State and Pill UI

**New state**: `pickMode: 'length' | 'character' | 'group-size' | 'act-scene'`

**Pill row**: Renders under the Auto/Pick toggle when `mode === 'pick'`. Same gold-border active styling as existing Auto/Pick buttons.

**Pill order**: Length | Character | Group Size | Act/Scene — leads with the most accessible question ("how long?") for new/casual users. Script-structural browsing is last since it requires script familiarity.

Each pill switches the content below. Selecting a new sub-mode clears the current scene selection.

---

### 3.3 By Character Sub-Mode

**User story**: "I want to play Woody" → show me all scenes where Woody appears.

**Implementation**:
1. Aggregate all unique characters across all scenes for the selected script (client-side from already-loaded `scenes` array)
2. Render character list as tappable pills/buttons
3. On character tap: filter scene list to scenes where `unique_characters` includes that character
4. Sort filtered scenes by that character's `dialogue_chunks` descending (from `character_stats`)
5. Scene list items show: heading, that character's line count, total cast size

---

### 3.4 By Group Size Sub-Mode

**User story**: "There's 3 of us, what can we do?"

**Implementation**:
1. Render group size selector: buttons for 2, 3, 4, 5, 6, 7+
2. Filter scenes using `roll_calls` JSONB — show scenes where the selected participant count has a valid roll call entry
3. Sort by fit quality: scenes where `characters ≈ participants` (everyone speaks) rank highest — implemented as fewer narrators = better fit
4. Scene list items show: heading, character count, how many would be narrators at this group size
5. The "7+" button matches any roll call entry with `participants >= 7`

---

### 3.5 By Length Sub-Mode (Spark / Beat / Moment)

**User story**: "We just want something quick and fun"

**Tier definitions**:

| Tier | Label | Subtitle | Max Dialogue/Char | Max Rehearsable |
|------|-------|----------|-------------------|-----------------|
| Spark | Spark | "1–2 lines, ~30s" | ≤ 2 | ≤ 6 |
| Beat | Beat | "A few lines, ~1m" | ≤ 5 | ≤ 15 |
| Moment | Moment | "Short scene, ~2–3m" | ≤ 12 | ≤ 30 |

**Calibration** (Toy Story, 109 scenes): Spark: ~52 scenes (47.7%), Beat: ~23 (21.1%), Moment: ~13 (11.9%). Well-balanced distribution.

**Implementation**:
1. Render three tier buttons with subtitles in a 3-column grid
2. Filter scenes using thresholds on `character_stats` max dialogue and `rehearsable_chunks`
3. Scene list items show: heading, character count, lines per character breakdown

---

### 3.6 Shared Scene List

All sub-modes share the same scene list container:
- Scene heading with scene number
- Tap to select (gold border highlight)
- Rehearsable line count with proper singular/plural grammar
- Each sub-mode adds its own context row (character lines, group fit stats, tier-relevant breakdown)

---

### 3.7 UX Polish

- **Sticky confirm button**: `sticky bottom-0` within the scene selection card so it doesn't scroll off
- **Increased scene list height**: `max-h-48` (192px) → `max-h-72` (288px)
- **Helper text**: "Generates call sheet and assigns roles" below the Confirm button in pick mode
- **Empty state messages**: Context-aware prompts ("Select a character above", "No scenes match")

---

## 4. API Changes Summary

**None.** All filtering and sorting is client-side using data already loaded in the `scenes` array. No new endpoints, no modified endpoints, no schema changes.

---

## 5. Frontend Changes Summary

### `page.tsx`

| Change | Description |
|--------|-------------|
| New state: `pickMode` | 4-value union type for sub-mode selection |
| New state: `selectedCharacter` | Currently selected character name for filtering |
| New state: `selectedGroupSize` | Currently selected group size for filtering |
| New state: `selectedLengthTier` | Currently selected length tier |
| Derived: `allCharacters` | Deduped, sorted character list from all scenes |
| Derived: `getPickScenes()` | Filtered + sorted scene list based on active sub-mode |
| Sub-mode pill row | 4 pills under Auto/Pick toggle |
| Character pills | Tappable character list |
| Group size buttons | 2–7+ selector |
| Length tier buttons | Spark/Beat/Moment 3-col grid |
| Unified scene list | Shared list with sub-mode-specific context rows |
| Bug fix: confirm disabled | `!selectedSceneId` only |
| Bug fix: line grammar | Singular/plural "line"/"lines" |
| UX: sticky confirm | `sticky bottom-0` |
| UX: taller scene list | `max-h-72` |
| UX: helper text | Below confirm button |

---

## 6. Visual Spec

All elements follow existing conventions: gold (#d4af37), bg (#0a0a0a), `bg-surface`, `border-border`, `text-muted`. No new colours introduced.

### Pick Mode — Length Sub-Mode Selected

```
┌──────────────────────────────────────┐
│  Scene Selection         Change Script│
│                                      │
│  ┌──────────┐ ┌──────────┐          │
│  │   Auto   │ │   Pick   │ ← active │
│  └──────────┘ └──────────┘          │
│                                      │
│  [Length] [Character] [Group] [Act]  │  ← sub-mode pills
│   ^^^^^ active                       │
│                                      │
│  ┌──────────┬──────────┬──────────┐ │
│  │  Spark   │  Beat    │  Moment  │ │  ← tier buttons
│  │ ~30s     │ ~1m      │ ~2-3m    │ │
│  └──────────┴──────────┴──────────┘ │
│                                      │
│  Scene 5                    3 lines  │  ← scene list
│  INT. ANDY'S ROOM                    │
│  2 characters · WOODY: 2, BUZZ: 1   │
│                                      │
│  Scene 12                   4 lines  │
│  EXT. BACKYARD                       │
│  1 character · SID: 2                │
│                                      │
│  ┌──────────────────────────────────┐│
│  │        Confirm Scene             ││  ← sticky
│  └──────────────────────────────────┘│
│  Generates call sheet and assigns    │
│  roles                               │
└──────────────────────────────────────┘
```

---

## 7. Implementation Order

Single-phase implementation — all changes are in one file (`page.tsx`) with no API or schema dependencies:

| Step | Scope | Risk |
|------|-------|------|
| 1 | Bug fixes: confirm disabled logic, chunks→lines grammar | Low |
| 2 | Add `pickMode` state + pill UI | Low |
| 3 | By Character sub-mode | Low |
| 4 | By Group Size sub-mode | Low |
| 5 | By Length sub-mode | Low |
| 6 | Shared scene list with context rows | Low |
| 7 | UX polish: sticky confirm, taller list, helper text | Low |

All steps are low-risk since the changes are entirely client-side UI with no backend dependencies.

---

## 8. Verification

1. `npm run build` — must pass
2. Dev test: create a room with Toy Story, enter Pick mode, verify each sub-mode:
   - By Act/Scene: existing behavior + bug fixes
   - By Character: tap "WOODY" → see Woody's scenes sorted by his line count
   - By Group Size: tap "3" → see scenes that fit 3 people, sorted by fit
   - By Length: tap "Spark" → see ~52 short scenes; "Beat" → ~23; "Moment" → ~13
3. Confirm a scene from each sub-mode → verify call sheet generates correctly
4. Mobile viewport: confirm button visible without scrolling

---

## 9. Out of Scope

| Item | Reason |
|------|--------|
| Cross-filtering (e.g. "Woody + Spark") | Sub-modes are independent; cross-filtering adds complexity without clear user demand |
| Coverage/rehearsal info per scene | Requires recording data lookups; separate feature |
| Character descriptions | Not in DB; would need script parsing enhancement |
| "Beyond" length tier | Scenes exceeding Moment scope are found via By Act/Scene |
| Step progress indicator | Deferred from previous PRD |

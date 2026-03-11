# /stage/[roomCode] Pick Mode — Critical Analysis on Investigation

**Snapshot**: `photo_2026-03-10_23-25-01.jpg`
**Date**: 2026-03-10 23:25
**State captured**: Pick mode, scene selection stage, 1 participant, Toy Story (1995)

---

## Core Insight

The current Pick mode offers exactly one way to browse scenes: **by Act/Scene**. This is the script-structural view — useful for directors who know the script, but limiting for casual or spontaneous use cases. The screenshot shows a user scrolling through 40+ Toy Story scenes with no way to filter by what actually matters to them: *who they want to play*, *how many people they have*, or *how long they want to rehearse*.

Pick mode should expand into multiple browse axes, each serving a different user intent.

---

## Proposed Pick Sub-Modes

The current Auto / Pick toggle remains. Under Pick, the user chooses a browse mode using the same pill/button style:

| Sub-Mode | Label | User Intent | Data Source |
|----------|-------|-------------|-------------|
| **By Act / Scene** | Act / Scene | "I know which scene I want" | `scenes.act_id`, `scenes.scene_number`, `scenes.scene_heading` — **already built** |
| **By Character** | Character | "I want to play Woody" | `scenes.unique_characters`, `scenes.character_stats` — **data exists, UI needed** |
| **By Group Size** | Group Size | "There's 3 of us" | `scenes.roll_calls` JSONB — **data exists, UI needed** |
| **By Length** | Length | "We just want something quick" | `scenes.character_stats[*].dialogue_chunks` — **data exists, mapping needed** |

---

## Sub-Mode 1: By Act / Scene (Current)

### What exists
- Act filter pills: All Acts, Act 1, Act 2, Act 3
- Scrollable scene list with heading, chunk count, character names
- Tap scene → Confirm Scene

### Critique from screenshot

**Working well:**
- Act filter pills are clear, gold active state is unambiguous
- Scene headings are legible with good hierarchy
- Character names in gold help preview who's in the scene
- "Change Script" link allows backtracking

**Issues:**
- **"chunks" is developer jargon** — "40 chunks" means nothing to users. Should say "40 lines" or similar. This was flagged in the 2026-03-09 analysis and persists.
- **"1 chunks" grammar bug** — should be "1 chunk" (singular).
- **Scene list container is too short** — `max-h-48` (192px) fits ~3.5 scenes. Toy Story has 40+ scenes. Creates nested scrolling on mobile which is awkward.
- **No coverage/rehearsal info per scene** — the data exists (recordings table) but isn't shown. Users can't see which scenes they've already done.
- **Confirm button disabled-logic bug** — enabled when an act filter is selected but no scene is picked. The condition checks `!selectedSceneId && !selectedActId` but should just check `!selectedSceneId` in pick mode.
- **Confirm button not sticky** — scrolls off viewport on longer pages. Should be fixed to bottom.
- **Selecting an act filter silently clears scene selection** — `setSelectedSceneId(null)` on act change with no feedback.

---

## Sub-Mode 2: By Character

### User story
"I want to play Woody" → show me all scenes where Woody appears, sorted by how much Woody talks.

### Data available
- `scenes.unique_characters` — array of character names per scene
- `scenes.character_stats` — JSONB: `[{ name: "WOODY", dialogue_chunks: 18, total_chunks: 22 }, ...]`
- Both are pre-computed at seed time. No new queries needed.

### Proposed UX
1. List all characters across the script (aggregate `unique_characters` from all scenes, deduplicate)
2. User taps a character name
3. Scene list filters to only scenes containing that character
4. Each scene shows that character's line count (from `character_stats[*].dialogue_chunks`)
5. Sort by line count descending — biggest roles first

### Data gaps
- None for basic functionality. Character data is fully seeded.
- **Nice to have**: character description or role summary — not in DB, would need script parsing enhancement.

---

## Sub-Mode 3: By Group Size

### User story
"There's 3 of us, what can we do?" → show me scenes that work well with 3 participants.

### Data available
- `scenes.roll_calls` — JSONB array: `[{ participants: N, characters: X, narrators: Y, actionsPerNarrator: Z }, ...]`
- Pre-computed for each possible participant count (1 to MAX_PARTICIPANTS)
- `scenes.unique_characters` — gives the ideal cast size

### Proposed UX
1. Group size selector: buttons for 2, 3, 4, 5, 6, 7+
2. Filters scenes where `roll_calls` has an entry for that participant count with a reasonable character-to-narrator ratio
3. Sort by quality of fit — scenes where `participants ≈ unique_characters.length` rank highest (everyone gets a speaking role, minimal narrator overflow)
4. Show per scene: character count, how many would be narrators at this group size

### Scoring logic
- Best fit: `characters === participants` (everyone is a speaking role)
- Good fit: `narrators <= 1` (at most one person narrating)
- Acceptable: `narrators > 1` but `actionsPerNarrator <= MAX_CHUNKS_PER_PERSON`
- Poor fit: scene has 2 characters but 7 participants (most people narrating)

### Data gaps
- None. `roll_calls` already encodes exactly this information.

---

## Sub-Mode 4: By Length (Quick Modes)

### User story
"We just want something quick and fun" → show me scenes that take under a minute, where each person only has 1-2 lines.

### Tiers

| Tier | Label | Description | Key Metric |
|------|-------|-------------|------------|
| **Spark** | Spark | Quick acting impulse. 10-30 seconds. One or two lines each. Pick up with a stranger. | Max ~2 dialogue lines per character |
| **Beat** | Beat | Small emotional moment. 30-90 seconds. A few lines, one dramatic beat. | Max ~5 dialogue lines per character |
| **Moment** | Moment | Short contained scene. 1-3 minutes. Beginning, middle, end. | Max ~12 dialogue lines per character |

### Mapping to data
The key metric is **max dialogue lines per character** — the heaviest speaking role in the scene. This comes from `character_stats`:

```
maxLinesPerCharacter = max(character_stats[*].dialogue_chunks)
```

Plus narrator load from rehearsable non-dialogue chunks. A Spark shouldn't overload narrators either.

**Proposed thresholds (need calibration):**

| Tier | Max dialogue lines (heaviest role) | Max rehearsable chunks total | Max narrator chunks per person |
|------|-----------------------------------|-----------------------------|-------------------------------|
| Spark | ≤ 2 | ≤ 6 | ≤ 2 |
| Beat | ≤ 5 | ≤ 15 | ≤ 4 |
| Moment | ≤ 12 | ≤ 30 | ≤ 8 |

### Proposed UX
1. Three buttons: Spark / Beat / Moment — each with subtitle (e.g. "1-2 lines each, ~30 sec")
2. Tapping a tier filters scenes that fit within that tier's thresholds
3. Scene list shows: heading, character count, lines per character breakdown
4. Sort by best fit for the tier (scenes that naturally land in the tier vs. scenes that barely qualify)

### Calibration Results (Toy Story, 109 scenes)

| Tier | Scenes | % of Script | Avg Rehearsable Lines | Avg Characters | Max Dialogue (heaviest role) |
|------|--------|-------------|----------------------|----------------|------------------------------|
| **Spark** | 52 | 47.7% | ~3 | 0.9 | 0–2 |
| **Beat** | 23 | 21.1% | ~10 | 2.5 | 3–5 |
| **Moment** | 13 | 11.9% | ~20 | 3+ | 6–12 |
| **Beyond** | 21 | 19.3% | ~37+ | 5+ | 13–30 |

**Thresholds are validated.** The distribution is well-balanced:
- Spark captures nearly half the script — plenty of material for spontaneous quick pickups
- Beat + Spark = 68.8% — most of the script is accessible for casual groups
- Moment provides 13 substantial scenes for deeper rehearsal
- Beyond scenes (19.3%) are the script's centerpieces — users find these via By Act/Scene

**"Beyond" is not shown in the Length picker** — those scenes exceed quick mode scope. Users who want full scenes use the By Act/Scene sub-mode.

**Terminology**: "Lines" replaces "chunks" app-wide in all user-facing UI. DB schema retains `chunk*` naming. This change is already underway.

---

## Page-Level Critiques (from screenshot)

### Improvements since 2026-03-09 analysis
- ✅ "Waiting Room" → "Backstage" — theatrical, descriptive
- ✅ "(you)" label added to cast list — self-identification fixed
- ✅ "Leave Room" added (per git log)

### Persisting issues
- ⬜ No step/progress indicator for creator flow (script → scene → callsheet)
- ⬜ Gold status dot has no legend
- ⬜ Solo cast section feels empty — no invite/share prompt
- ⬜ Action buttons not sticky to viewport bottom

### New observations
- **Script name disconnected from scene selection** — "Toy Story (1995)" floats below the room code. It should feel like the heading of the scene selection card.
- **No explanation of what happens after Confirm** — users don't know if confirming generates a call sheet, starts rehearsal, or assigns roles. A single line of context would reduce hesitation.

---

## Feasibility Summary

| Sub-Mode | Data Ready | New DB Work | New API Work | New UI Work |
|----------|-----------|-------------|-------------|-------------|
| By Act/Scene | ✅ Complete | None | None | Bug fixes only |
| By Character | ✅ Complete | None | Character list endpoint | Filter + sort UI |
| By Group Size | ✅ Complete | None | None (client-side filter on roll_calls) | Selector + fit scoring UI |
| By Length | ✅ Data exists | None | Threshold mapping logic | Tier selector + filtered list UI |

**No database migrations needed.** All four sub-modes can be built on existing seeded data. The work is entirely UI + client-side filtering logic, with possibly one new API endpoint for aggregating characters across a script.

---

## Resolved Decisions

1. **Tier thresholds validated** — Spark/Beat/Moment thresholds are well-balanced against Toy Story (109 scenes). No adjustment needed.
2. **"Lines" replaces "chunks" app-wide** — already underway via separate effort. This work uses "lines" throughout.
3. **Sub-modes are independent** — one browse mode at a time. No cross-filtering (e.g. no "Woody + Spark" combo).
4. **UI style**: Same pill/button pattern as existing Auto/Pick toggle. Sub-mode pills appear under Pick.

## All Questions Resolved

Pill ordering: **Length | Character | Group Size | Act/Scene** — leads with the most accessible question ("how long?") for new/casual users. Script-structural browsing is last since it requires script familiarity.

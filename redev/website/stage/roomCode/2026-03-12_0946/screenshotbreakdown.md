# Scene Selection Screenshot Breakdown

**Screenshot**: `scene selection screenshot.PNG`  
**Route**: `/stage/[roomCode]`  
**Captured state**: creator scene selection, `Pick` mode, `Length` sub-mode, `Moment` tier selected  
**Session folder**: `redev/website/stage/roomCode/2026-03-12_0946/`

## Note on Marked Areas

The request referred to 5 marked areas, but the screenshot stored in this folder shows 4 visible red callouts. This report is therefore anchored to the 4 visible annotations:

1. `0 rehearsable lines`
2. `0 lines`
3. `1 participant`
4. `1 speaking`

## System Map

This scene-selection card is built from three different data sources:

1. **Scene records from Supabase**
   Loaded in `src/app/(protected)/stage/[roomCode]/page.tsx` via `loadScriptDetails()`.
   These provide `scene_heading`, `scene_number`, `rehearsable_chunks`, `character_stats`, `unique_characters`, and `roll_calls`.

2. **Chunk-level runtime breakdown**
   The same `loadScriptDetails()` call fetches all `chunks` for the loaded scenes and computes `sceneLineBreakdowns` in memory.
   This creates per-scene totals for:
   - `rehearsableLines`
   - `dialogueLines`
   - `narrationLines`

3. **Live room participant state**
   Presence comes from `usePresence(roomCode)` and is reduced to `participants.length`.
   That participant count is matched against each scene's seeded `roll_calls` data.

This matters because the screenshot is showing values from different layers at once. The `0 lines` labels come from the chunk-derived breakdown. The `1 participant` and `1 speaking` labels come from realtime participant state plus seeded roll-call metadata.

## Area 1: `0 rehearsable lines`

### What it is for

This is the secondary metadata line under the scene title. Its purpose is to summarize the number and composition of playable lines in the scene card.

In healthy states it can show:

- `X dialogue + Y narration`
- or `0 rehearsable lines` when no non-system lines are found

This gives the creator a quick sense of whether the scene actually contains recordable material.

### Where it derives its information

Rendered in `src/app/(protected)/stage/[roomCode]/page.tsx`.

For each scene card:

- `breakdown = sceneLineBreakdowns[scene.id]`
- `dialogueLines = breakdown?.dialogueLines ?? sum(character_stats.dialogue_chunks)`
- `rehearsableLines = breakdown?.rehearsableLines ?? getSceneRehearsableLines(scene)`
- `narrationLines = breakdown?.narrationLines ?? max(0, rehearsableLines - dialogueLines)`

If both dialogue and narration resolve to `0`, the UI renders `0 rehearsable lines`.

Primary source in this screenshot:

- `sceneLineBreakdowns[scene.id].rehearsableLines`

Fallback source if runtime breakdown is missing:

- `scene.rehearsable_chunks`
  via `getSceneRehearsableLines(scene)` in `src/lib/line-helpers.ts`

### Upstream process that produces it

`sceneLineBreakdowns` is computed at runtime by loading `chunks` for all scene IDs and counting non-system chunks:

- any chunk with `is_system = true` is skipped
- non-system `dialogue` chunks increment `dialogueLines`
- non-dialogue non-system chunks increment `narrationLines`
- every non-system chunk increments `rehearsableLines`

The fallback field `scene.rehearsable_chunks` is produced earlier at seed time in `supabase/seed/seed.ts`, where the scene is enriched from parsed script chunks before being inserted into the `scenes` table.

### Processes relying on this section

- **Scene list credibility**: users use this label to judge whether a scene has any playable content
- **Length-mode filtering**: pick-mode length tiers compare candidate scenes against rehearsable line totals
- **Empty scene suppression**: scenes with no heading and no rehearsable content are treated as placeholders and hidden
- **Narration inference**: narration count is derived partly from this total

### What is required for it to exist / render

- a valid room and selected script
- `acts` and `scenes` successfully loaded from Supabase
- `chunks` successfully loaded for the selected script's scenes
- `chunks.is_system` populated correctly
- `sceneLineBreakdownsLoaded` completed for non-`act-scene` pick modes
- or, if chunk breakdown is unavailable, `scenes.rehearsable_chunks` must already be populated from seed data

### Current issue shown by the screenshot

The screenshot shows `0 rehearsable lines` on scenes that still show speaking-role metadata below. That strongly suggests a mismatch between:

- runtime chunk-derived line totals
- and pre-seeded character / roll-call metadata

That mismatch is what makes the UI look contradictory.

## Area 2: `0 lines`

### What it is for

This is the top-right summary count on each scene card. Its job is to provide the headline line total for quick scanning and comparison across scenes.

It is the most visually prominent quantitative value on the card.

### Where it derives its information

Rendered from the same `rehearsableLines` value used above:

- `const rehearsableLines = breakdown?.rehearsableLines ?? getSceneRehearsableLines(scene);`
- UI output: `{rehearsableLines} line` or `{rehearsableLines} lines`

So in this screenshot, `0 lines` and `0 rehearsable lines` are two presentations of the same underlying count.

### Upstream process that produces it

Same sources as Area 1:

- runtime `sceneLineBreakdowns`
- fallback `scenes.rehearsable_chunks`

The value ultimately depends on either:

- correct chunk loading and correct `is_system` classification at runtime
- or correct seed-time `rehearsable_chunks` persistence in the `scenes` table

### Processes relying on this section

- **Creator scene selection**: this is the primary scan metric when browsing candidate scenes
- **Length tier trust**: if `Moment` scenes all say `0 lines`, the length taxonomy stops being believable
- **Sorting and comparison expectations**: users assume scenes with higher counts contain more material, even if the current UI is not explicitly sorting by this label in length mode

### What is required for it to exist / render

- the scene card must exist in `pickScenes`
- the scene must survive filtering in `getPickScenes()`
- a `Scene` object must be present
- either a runtime breakdown or a populated `rehearsable_chunks` field must exist

### Current issue shown by the screenshot

The label is reporting zero on all visible cards while the lower row still says the scene can support one speaking participant. That creates a direct contradiction in the scene card itself and makes the card appear broken.

## Area 3: `1 participant`

### What it is for

This label tells the creator how many people the scene configuration is being described for in the current room state.

It is not a property of the scene by itself. It is a scene-to-room fit label.

In this screenshot it means:

- there is currently 1 participant present in the room
- the UI is describing how this scene would map to a 1-person session

### Where it derives its information

Rendered in the `pickMode === 'length'` branch of the scene card context row.

The value comes from:

- `participants.length`
  where `participants` is derived from `usePresence(roomCode)`

Then:

- `getRollCallEntryForParticipants(scene, participants.length)`

If a matching roll-call entry exists, the UI renders:

- `{participantEntry.participants} participant(s)`

So the displayed `1 participant` is a combination of:

- realtime room presence
- matched against the scene's stored `roll_calls` array

### Upstream process that produces it

Two separate processes feed this label:

1. **Realtime presence tracking**
   `usePresence(roomCode)` subscribes to room presence and determines how many users are currently present.

2. **Seed-time roll-call generation**
   `roll_calls` are written into the `scenes` table in `supabase/seed/seed.ts`.
   They are generated by `computeRollCalls()` in `src/lib/matchmaking/roll-call.ts` from:
   - number of unique dialogue characters
   - number of action/narration chunks

### Processes relying on this section

- **Length-mode contextual messaging**: tells the creator how the current room size maps onto each scene
- **Solo rehearsal expectations**: makes it clear whether a one-person room can cover the scene
- **Auto-selection logic alignment**: while the label itself is UI-only, the same `roll_calls` dataset is also used in scene selection / matchmaking logic elsewhere

### What is required for it to exist / render

- room presence must be active
- at least one participant must be visible to the presence hook
- the scene must have a `roll_calls` entry matching the current participant count
- the scene card must be rendered in `length` mode

If no roll-call entry exists, the UI falls back to other summaries rather than showing this participant-based sentence.

### Important nuance

This value does **not** prove the scene has playable lines. It only proves that the roll-call model says the scene can be mapped to one participant.

That is why it can disagree with the zero-line labels above if the underlying data sources drift apart.

## Area 4: `1 speaking`

### What it is for

This label tells the creator how many speaking character roles are expected for the current participant-count fit.

In this screenshot, `1 speaking` means:

- for a room with 1 participant
- the matched roll-call entry expects 1 speaking character role

This helps the creator understand whether the scene is:

- solo speaking
- solo with narration
- multi-speaker
- or narration-heavy

### Where it derives its information

Rendered immediately after `1 participant` from the same `participantEntry`:

- `{participantEntry.characters} speaking`

This comes from the scene's `roll_calls` array.

That `roll_calls` data is precomputed, not derived live from the visible chunk totals on this page.

### Upstream process that produces it

At seed time:

- `uniqueCharacters` are extracted from dialogue chunks
- dialogue chunk counts are aggregated into `character_stats`
- action chunk count is inferred from performable chunks minus dialogue chunks
- `computeRollCalls(uniqueCharacters.length, actionChunkCount)` generates the participant-fit table

For a scene with one character and no narrator requirement for a one-person setup, the entry becomes effectively:

- `participants: 1`
- `characters: 1`
- `narrators: 0`

### Processes relying on this section

- **Scene fit explanation in length mode**
- **Expectation-setting for call sheet generation**
- **Matchmaking consistency**
  the same roll-call concept is used in scene-selection and suitability logic outside this card

### What is required for it to exist / render

- `roll_calls` must exist on the scene record
- the current participant count must match a valid roll-call entry
- the card must be rendered in `length` mode
- the scene must still be included by the selected length-tier filter

### Current issue shown by the screenshot

`1 speaking` conflicts with `0 rehearsable lines` and `0 lines`.

That means one of these is true:

- runtime chunk breakdown is undercounting or failing
- seed-time scene metadata is stale relative to chunks
- chunks are classified as system lines incorrectly
- scenes and chunks are out of sync in Supabase

## Why the Screenshot Looks Contradictory

The contradiction is caused by the card mixing values from different pipelines:

- `0 rehearsable lines` and `0 lines` are runtime breakdown values derived from `chunks`
- `1 participant` and `1 speaking` are seeded fit-model values derived from `roll_calls` plus live room presence

If the chunk breakdown path says zero while the seeded metadata path still says one speaking role exists, the card can render exactly what is shown in this screenshot.

## Minimum Data and Process Requirements for the Whole Card

For the scene-selection card to render correctly end to end, all of the following have to be true:

1. The user is authenticated and can load the room.
2. The room has a selected script.
3. `acts` for that script load successfully.
4. `scenes` for those acts load successfully.
5. Each scene has meaningful seed-time metadata:
   - `scene_heading`
   - `scene_number`
   - `rehearsable_chunks`
   - `character_stats`
   - `roll_calls`
6. `chunks` load for all displayed scenes.
7. `chunks.is_system` is classified correctly.
8. Room presence is available so `participants.length` is accurate.
9. `sceneLineBreakdownsLoaded` completes before non-`act-scene` filtering runs.
10. The selected length tier is applied against valid rehearsable line counts.

If any of those fail, the card can still partially render, but different rows may come from different truth sources and stop agreeing with each other.

## Practical Conclusion

The marked areas are not five independent features. They are four visible outputs produced by two different data pipelines:

- **line-count pipeline**: scenes + chunks -> runtime `sceneLineBreakdowns`
- **fit-model pipeline**: seeded scene metadata + live presence -> `roll_calls` participant messaging

The screenshot is useful because it shows those two pipelines disagreeing on the same scene card. That makes the issue more than a styling problem. It is a data-consistency problem in the scene selection flow.

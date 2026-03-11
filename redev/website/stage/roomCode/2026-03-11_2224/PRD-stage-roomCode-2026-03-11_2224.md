# PRD-stage-roomCode-2026-03-11_2224

**Author**: redev session 2026-03-11_2224
**Status**: Draft
**Page**: `/stage/[roomCode]`
**Focus**: Narrator-only scene reliability across Pick and Rehearse

---

## Problem

Validation from the March 11, 2026 22:24 redev session shows that narrator-capable scenes are unreliable across the selection flow:

- Pick mode can render playable scenes as `0 rehearsable lines`
- `Scene 0 Untitled` can still appear despite being truly empty
- narrator-only or narration-heavy scenes can survive to the call sheet with correct narrator counts, but still fail in rehearsal with `No lines assigned to you for this session.`

This means the system currently breaks in two places:

1. the Pick-mode count/render pipeline
2. the narrator assignment handoff into the rehearse experience

---

## Goal

Make narrator-capable scenes reliable end-to-end:

- valid scenes display correct counts in Pick mode
- empty placeholder scenes are excluded
- narrator assignments shown on the call sheet survive into rehearsal playback

---

## Non-Goals

- redesigning Pick mode layout or styling
- changing Spark / Beat / Moment thresholds
- revisiting Character or Group Size UX beyond what is required for correctness

---

## Product Requirements

### 1. Pick mode must show correct rehearsable counts

Length-mode scene cards must reflect the actual rehearsable lines available for the scene.

Acceptance criteria:
- Scene cards do not display `0 rehearsable lines` when the underlying scene has playable dialogue or narration.
- Narration-heavy scenes such as Toy Story Scene 1 display non-zero rehearsable totals.
- One-line narration scenes such as Toy Story Scene 2 display their correct non-zero total.

### 2. Character breakdown and total counts must agree

The same card must not present valid character lines alongside false zero totals.

Acceptance criteria:
- If a card shows a non-zero character breakdown such as `ANDY: 2`, the card's total line display is also non-zero.
- Pick-mode cards derive totals and role summaries from one normalized data path.

### 3. Scene cards must show a full line-type breakdown

Each scene card in Pick mode must expose how the total scene line count is composed.

Acceptance criteria:
- The card lists all line types that make up the scene total, including narration, dialogue, and system lines when present.
- The breakdown is ordered by highest count first, for example: `37 narration, 12 dialogue, 1 system`.
- The total scene line count is shown separately on the right side of the card, for example: `50 lines`.
- The breakdown counts sum exactly to the total shown on the right.
- The same underlying count model is used for both the breakdown and the total.

### 4. Empty placeholder scenes must be filtered out

Scenes with no heading and no rehearsable content must not be selectable.

Acceptance criteria:
- Truly empty scenes like `Scene 0 Untitled` do not appear in Pick mode.
- Confirm actions are impossible for filtered-out empty scenes.

### 5. Narrator-only scenes must remain playable after the call sheet

If the call sheet indicates narrator work is assigned or available, the rehearse flow must preserve that assignment.

Acceptance criteria:
- A scene that reaches the call sheet with `1 narrator line` does not land on rehearse with `No lines assigned to you for this session.` for the assigned user.
- Narrator-only scenes and mixed dialogue/narration scenes both carry narrator assignments correctly into rehearse.
- The rehearse page renders assigned narrator lines the same way it renders other valid assigned work.

### 6. Call sheet and rehearse must agree on narrator assignment state

Narrator role state must not be lost between role selection, session start, and rehearsal playback.

Acceptance criteria:
- If a user claims or is assigned narrator work on the call sheet, that assignment is persisted into the started session.
- Starting rehearsal does not drop narrator-only assignments.
- Solo narrator sessions are supported when the selected scene is valid and contains only narration.

### 7. Validation must cover both count correctness and playback correctness

This bug spans more than one stage, so completion must be validated across the full path.

Acceptance criteria:
- Pick mode shows correct totals for the tested Toy Story scenes from this redev session.
- Pick mode shows the full line-type breakdown in descending count order, and the breakdown sums to the displayed total.
- A narrator-only scene that shows narrator lines on the call sheet reaches rehearse with assigned lines intact.
- No tested path reaches the `No lines assigned to you for this session.` dead end when narrator work was actually assigned.

---

## Implementation Notes

- Treat Pick-mode displayed counts as a normalized summary derived from one canonical source of scene line data.
- Build the card breakdown from complete scene composition, not only rehearsable subsets, so the displayed type list and total can account for narration, dialogue, and system lines together.
- Verify whether `sceneLineBreakdowns`, scene aggregate fallbacks, and card rendering can diverge during initial load or stale state.
- Trace narrator-role state from call-sheet claim/assignment through `startSession()` and into the rehearse page's assigned-line loading path.
- Fixes should preserve the improved `narrator only` wording while correcting the underlying data behavior.

---

## Validation Cases

1. Toy Story Scene 0: excluded from Pick mode as empty.
2. Toy Story Scene 1 (`INT. ANDY'S BEDROOM`): displays non-zero rehearsable totals in Pick mode.
3. Toy Story Scene 2 (`INT. STAIRWELL`): displays `1` rehearsable line in Pick mode.
4. Scene cards show a descending line-type breakdown such as `37 narration, 12 dialogue, 1 system`, with the right-side total matching the sum.
5. Reproduced narrator case on `/stage/Z52LJ3/rehearse`: no longer drops the assigned narrator line after the call sheet.

---

## Source Artifact

- [`critical-analysis.md`](./critical-analysis.md) - source analysis and failure breakdown
- [`03-11-26- 22-24.PNG`](./03-11-26- 22-24.PNG) - screenshot from the validation session

# /stage/[roomCode] Pick Mode Length Validation - Critical Analysis

**Snapshot**: `03-11-26- 22-24.PNG`
**Room**: P8KHSM, Toy Story (1995)
**Date**: 2026-03-11 22:24
**State captured**: Pick mode, Length axis, Spark tier selected

**Previous context**: This appears to be a follow-up validation pass after the earlier narrator-only / zero-line issues documented in `redev/website/stage/roomCode/2026-03-11_0128/critical-analysis.md`.

---

## What Improved

### 1. Narrator-only scenes are now labeled explicitly

Scene 0 shows `narrator only` instead of the earlier `0 characters` wording. That is a clear improvement in user language. It matches the actual shape of the scene better and removes one of the previous ambiguities.

### 2. The Length card now surfaces rehearsable-line language

The card body shows `0 rehearsable lines`, which is more precise than the earlier generic `0 lines` label on its own. The UI is moving toward the right concept, even if the filtering and count consistency are still wrong.

---

## Critical Issues

### Issue 1: Spark still includes scenes with zero rehearsable lines

**Severity: High**

The Spark list is visibly populated with scenes that show `0 rehearsable lines`:

- Scene 0: `Untitled`
- Scene 1: `INT. ANDY'S BEDROOM`
- Scene 2: `INT. STAIRWELL`

This means the earlier failure mode was not actually closed at the list-filtering level. The user is still being offered scenes that do not satisfy the basic promise of a rehearsal picker.

**Why this matters**:
- Spark is supposed to be the fastest path to a playable scene.
- Zero-line entries crowd out valid choices at the very top of the funnel.
- If the user confirms one of these scenes, the flow likely degrades into the same dead-end behavior seen in the 2026-03-11_0128 session.

**Required fix**:
- Exclude any scene with `0 rehearsable lines` from Length mode results.
- If narrator-only scenes are intended to be playable, then the rehearsable count needs to reflect that accurately and the scene must not display as zero-line.

### Issue 2: The scene card is still showing contradictory counts

**Severity: High**

Scene 1 displays:

- `0 rehearsable lines`
- `1 character · ANDY: 2`
- `0 lines` in the right-hand summary

Those numbers cannot all be true at the same time. If Andy has 2 lines, then the scene cannot simultaneously present as zero-line and zero-rehearsable.

This is the same underlying trust problem identified in the earlier session: the browse card and the actual scene metadata are not using a single definition of line count.

**Likely causes**:
- The card body and the right-hand summary are reading different fields.
- The per-character breakdown is sourced from `character_stats`, while the headline count is sourced from a stale or differently computed aggregate.
- Narration/dialogue/rehearsable totals are still not normalized into one consistent display contract.

**Required fix**:
- Define one canonical scene-count model for the picker card.
- Ensure headline count, supporting text, and per-character breakdown all derive from the same source data.

### Issue 3: An `Untitled` Scene 0 is exposed in the picker

**Severity: Medium**

The first visible result is `Scene 0 Untitled`. Even before looking at line counts, that looks like parser fallout or placeholder data rather than a user-ready scene.

If `Scene 0` is a real import artifact, it should not appear in the production picker. If it is legitimate content, it still needs a meaningful heading before it can be considered selectable.

**Required fix**:
- Suppress placeholder / import-artifact scenes from picker results.
- Add validation in the scene selection query so scenes without a usable heading are not surfaced.

### Issue 4: Spark quality is degraded by dead entries

**Severity: Medium**

The first viewport in Spark mode is dominated by non-usable or suspicious entries. Even without tapping anything, the picker currently communicates low confidence:

- multiple zero-line cards
- placeholder naming
- inconsistent metadata

This is not just a data bug; it weakens the product's core promise that Pick mode gives intentional, high-signal browsing.

**Required fix**:
- After filtering invalid scenes, sort Spark results so the first screen is entirely playable.
- If no valid Spark scenes remain, show an empty state and recommend Beat/Moment instead.

---

## Summary

This screenshot shows that the UI copy improved, but the underlying picker contract is still broken. The system now *describes* narrator-only and rehearsable-line concepts more clearly, yet it still surfaces zero-line scenes and still presents contradictory counts inside the same card.

The next change should focus on **data integrity in Pick > Length**, not visual polish:

1. remove invalid scenes from results
2. unify all count displays under one canonical source
3. suppress placeholder scenes like `Scene 0 Untitled`

Until that lands, Length mode remains unreliable at the exact moment the user is trying to make a fast confident choice.

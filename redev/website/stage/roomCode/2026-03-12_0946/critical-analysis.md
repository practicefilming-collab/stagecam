# /stage/[roomCode] Scene Selection — Critical Analysis

> **SUPERSEDED** — The P0 "0 lines" issue identified here was resolved by commit `2f56d2a` (loading guard, PRD-stage-roomCode-2026-03-11_2337 Fix 1). The P1 metadata contradiction was also resolved by the same fix. No further action needed from this session.

**Snapshot**: `scene selection screenshot.PNG`
**Room**: NXBHZG
**Date**: 2026-03-12 09:46
**State captured**: Pick mode (Length > Moment)

---

## What's Working

### 1. Length > Moment filter is functional
The filter is correctly identifying "Moment" tier scenes (Scenes 1, 2, 3). The UI clearly indicates that "Moment" is selected (yellow border/text).

### 2. Character and Narrator breakdown is present
Scene 1 shows `1 speaking`, and Scene 2 shows `0 speaking · 1 narrator`. This metadata is being correctly derived from the scene's cast list.

### 3. Navigation and Mode selection
The "Pick" mode is active, and the taxonomy (Length/Character/Group Size/Act-Scene) is visible. The "Confirm Scene" button is prominent at the bottom.

---

## Critical Issues

### Issue 1: "0 lines" and "0 rehearsable lines" on all scene cards

**Severity: P0 — systemic display failure**

Every scene in the "Moment" filter (1, 2, 3) shows `0 lines` and `0 rehearsable lines`. 
- **Annotation 1 & 2**: Points to the `0 rehearsable lines` and `0 lines` labels on Scene 1.

**Impact**: This is a critical failure of the Pick flow. A user looking for a "Moment" (short scene, ~2–3m) is told that every available scene has 0 lines. This makes the selection process appear broken or the script appear empty.

**Root Cause**: This is a repeat of the issue flagged in `2026-03-11_2337`. The `sceneLineBreakdowns` query is either failing, not yet resolved, or the UI is falling back to stale `rehearsable_chunks = 0` data from the database.

### Issue 2: Metadata contradictions

**Severity: P1 — erodes user trust**

- **Annotation 3 & 4**: Points to `1 participant · 1 speaking` on Scene 1, which contradicts the `0 rehearsable lines` directly above it.
- Scene 2 shows `1 participant · 0 speaking · 1 narrator` alongside `0 rehearsable lines`.

**Impact**: The UI is telling the user there is a speaking character but 0 lines for them to speak. This internal inconsistency makes the app look unpolished and unreliable.

---

## Summary: Priority Ranking

| Priority | Issue | Severity | Status |
|----------|-------|----------|--------|
| **P0** | #1: All scene cards show "0 lines" in Moment mode | High | Systemic regression/unfixed bug |
| **P1** | #2: "0 lines" contradicts speaking/narrator metadata | Medium | Systemic inconsistency |

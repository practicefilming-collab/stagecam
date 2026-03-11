# /stage/[roomCode] Pick → Call Sheet Flow — Critical Analysis

**Snapshot**: `photo_1_2026-03-11_23-37-34.jpg`, `photo_2_2026-03-11_23-37-34.jpg`
**Room**: 7J78W2, Toy Story (1995), 1 participant (@Mr_Ridley)
**Date**: 2026-03-11 23:33–23:34
**State captured**: Pick mode (Length > Spark) → Confirm Scene 7 → Call Sheet with role claiming

---

## What's Working

### 1. Pick → Call Sheet transition is seamless
The user selects Scene 7 from the Spark filter, hits Confirm, and immediately gets a fully populated Call Sheet. The flow is clear and linear — no loading states or confusion between steps.

### 2. Call Sheet information density is good
Photo_2 shows Act/Scene label, scene heading, rehearsable line count, character vs narrator line breakdown, and claimable roles — all without scrolling. The user has everything they need to decide whether to proceed.

### 3. Instagram-linked identity (@Mr_Ridley)
First session showing a non-Incognito user. The identity persists across both screenshots (scene selection and call sheet), confirming auth state carries through the flow.

### 4. Length > Spark filter correctly narrows
Only scenes 7, 8, 9 appear — all short scenes. The filter taxonomy (Length/Character/Group Size/Act-Scene) and tier pills (Spark/Beat/Moment) are consistent with earlier sessions.

---

## Critical Issues

### Issue 1: "0 lines" on scene cards is misleading

**Severity: High — false signal to user**

All three scenes (7, 8, 9) show "0 lines" in the scene selection list (photo_1). But after confirming Scene 7, the Call Sheet (photo_2) reveals **8 rehearsable lines** (1 character + 7 narrator lines).

This is the same inconsistency flagged in the JEBBS9 session (Issue #3), still unfixed. The scene card is either:
- Showing dialogue-only count (0) while callsheet shows total rehearsable (8)
- Using a stale/incorrect `rehearsable_chunks` value from the scene record

**Impact**: A user sees "0 lines" and has no reason to pick that scene. The Spark filter becomes useless if every scene shows 0 — it looks like there's nothing to rehearse. The only reason the user confirmed Scene 7 here was likely testing, not because the UI guided them to it.

**Fix**: Scene cards must show the same rehearsable line count the callsheet will display. If Scene 7 has 8 rehearsable lines, the card should say "8 lines".

### Issue 2: "0 rehearsable lines" contradicts "1 participant · 1 speaking"

**Severity: Medium — contradictory metadata**

Scene 7 card (photo_1) shows:
- `0 rehearsable lines`
- `1 participant · 1 speaking`

If there are 0 rehearsable lines, how can there be 1 speaking character? The participant/speaking counts come from the cast analysis but the line count comes from a different source. These two pieces of information directly contradict each other.

Scene 8 is even worse: `0 rehearsable lines`, `1 participant · 0 speaking · 1 narrator`. The narrator count suggests lines exist, but "0 rehearsable lines" says otherwise.

**Impact**: Users learn to distrust the numbers. The metadata row is meant to help them make informed scene choices — contradictory data defeats that purpose entirely.

### Issue 3: Scene 8 "0 speaking" likely repeats the JEBBS9 dead-end path

**Severity: Medium — known regression still present**

Scene 8 shows `1 participant · 0 speaking · 1 narrator`. This is the same scene (INT. DOWNSTAIRS HALLWAY - CONTINUOUS) that caused the "No lines assigned" dead end in JEBBS9 (photos 14-17 in that session). The scene is still appearing in the Spark filter with no guard against narrator-only scenes.

If the user picks Scene 8 here, they'll hit the same dead-end unless they manually claim the Narrator role.

**Impact**: The JEBBS9 critical analysis flagged this as P0. It remains unfixed.

### Issue 4: "Start Rehearsal (0/1 ready)" is enabled without any role claimed

**Severity: Medium — premature action available**

Photo_2 shows "Start Rehearsal (0/1 ready)" as the primary CTA with "Select at least one role to ready up" as helper text. The button appears tappable despite 0/1 readiness.

Combined with the message "1 role unclaimed — will be auto-assigned", this creates ambiguity: will the system auto-assign MRS. DAVIS if I just hit Start? Or will I get the "No lines assigned" dead end?

For a solo user, this should be clearer — either auto-claim the only character role, or disable Start until they've claimed.

---

## Observations

### The Spark filter is currently non-functional in practice

All three Spark scenes show 0 lines. A user browsing Spark to find a quick rehearsal sees nothing worth picking. The filter *works* technically (it returns short scenes) but the display makes every result look empty. This undermines the entire Pick > Length flow for the most accessible tier.

### Call Sheet is the strongest new screen

Photo_2 is well-structured: clear hierarchy (Act · Scene → heading → stats → roles → CTA). The "Claim" buttons are prominent. The narrator/character split gives the user real choice. If the scene card numbers matched, the full Pick → Call Sheet → Rehearsal flow would be solid.

### Solo user experience needs attention

A single user in a room sees "1 role unclaimed — will be auto-assigned" but has to manually claim. For solo users, auto-claiming the single available character role would remove friction and prevent the dead-end path.

---

## Summary: Priority Ranking

| Priority | Issue | Severity | Status |
|----------|-------|----------|--------|
| **P0** | #1: Scene cards show "0 lines" when callsheet shows 8 | High | Repeat from JEBBS9 #3 — still unfixed |
| **P1** | #2: "0 rehearsable lines" contradicts "1 speaking" | Medium | New observation |
| **P1** | #3: Narrator-only dead-end scene still in Spark filter | Medium | Repeat from JEBBS9 #1/#2 — still unfixed |
| **P1** | #4: Start Rehearsal enabled with no roles claimed | Medium | Repeat from JEBBS9 #2 |

# /stage/[roomCode] — Debate on Critical Analysis

**Date**: 2026-03-09
**Page**: `/stage/[roomCode]` (Waiting Room / Backstage)
**Follows**: [`critical-analysis.md`](./critical-analysis.md) — screenshot review that identified 8 elements for debate
**Method**: Each of the 8 elements from the critical analysis was debated live — both sides argued, then a verdict was made by the stakeholder

---

## Point 1: Header Bar

**Critique**: Standard gold italic StageCam branding left, hamburger menu right, dark bar. Same as every page. No issues identified — consistent, legible, on-brand.

**Case for change**: None raised.

**Case for keeping**: Universal mobile nav pattern. Consistent across the app, zero friction.

**Verdict**: **No change.** Nothing to fix.

---

## Point 2: Room Code Header ("Waiting Room" naming)

**Critique**: "Waiting Room" is generic and undersells the page's complexity. This is the most complex page in the app (3-stage creator flow, real-time presence, mode selection, call sheet preview). The label frames it as a passive lobby. Script name "Toy Story (1995)" sits below the room code, disconnected from the flow.

**Case for change**: The page does far more than waiting. Theatrical alternatives like "Backstage" or "Green Room" fit the app's theme better. "Backstage" implies preparation and activity, which is exactly what happens here. Zero engineering cost to rename.

**Case for keeping**: "Waiting Room" is universally understood. Users immediately know what the page is. No learning curve.

**Verdict**: **Change — rename "Waiting Room" to "Backstage."** More theatrical, fits the app's language, and better represents the page's purpose. Script placement is **deferred** — there's only one script currently picked from a basic picker, so redesigning script display isn't worth it until multi-script is a real scenario.

---

## Point 3: Cast Section

**Critique**: Three issues — (a) Gold dot next to each name is ambiguous (online? not ready? just decoration), no legend; (b) No "(you)" indicator next to your own name; (c) Solo use feels hollow with 1 participant taking up space.

**Case for change**: "(you)" label helps orientation especially in larger groups and costs almost nothing. A dot legend would eliminate guesswork for first-time users. A solo-mode message like "Share the room code to invite others" would help lone users.

**Case for keeping**: Gold/green dots are learnable without a legend. Solo use is an edge case or testing scenario — over-designing for it may hurt the group experience.

**Verdict**:
- **Add "(you)" label** next to the current user's name — cheap and helpful.
- **Defer dot legend** — learnable, revisit when larger groups are tested.
- **Skip solo adaptation** — edge case, don't clutter.

---

## Point 4: Auto-Match Summary

**Critique**: Six sub-issues — "110 Candidate Scenes" is overwhelming and unexplained, "3% Avg Coverage" reads as a failure state, "~9 Chunks / Person" is jargon, "Roles assigned when rehearsal starts" is buried and passive, "Change Mode" is cryptic, and there's no explanation of what auto mode actually does.

**Case for change**: The stats use the wrong words for the audience. "Candidate Scenes" means nothing without context. "3% Avg Coverage" triggers anxiety ("are we failing?"). "Chunks" is developer jargon. Every label creates confusion. The section should either explain itself or show different metrics.

**Case for keeping**: Every word added increases cognitive load. The section is already dense. Stats are technically accurate. Power users appreciate precision. Simplifying could mean losing useful information.

### Sub-verdicts:

**"110 Candidate Scenes"**: **Investigate.** Unclear what this number represents even to the stakeholder. Needs matchmaking research to understand what it measures before deciding whether to keep, rename, or remove.

**"3% Avg Coverage"**: **Investigate.** Unclear why this is useful at the waiting room stage. Research needed to determine if it serves a purpose and whether something more useful could replace it.

**"~9 Chunks / Person"**: **Deferred.** If "chunks" is renamed, it must be renamed site-wide — too big a change for this page's redesign alone. The question of whether "pieces" or another term is better remains open but is a cross-cutting decision.

**"Roles assigned when rehearsal starts"**: **Major change — replaced by role drafting flow** (see dedicated section below). Users now self-select roles before readying up, making this passive message obsolete.

**"Change Mode"**: **Change to "Change Scene."** Self-explanatory once renamed. Low cost.

---

## Role Drafting Flow (emerged from Point 4 debate)

A major new interaction pattern proposed and accepted during the Point 4 debate. Instead of roles being auto-assigned when rehearsal starts, users actively draft their roles beforehand.

### Full Flow

1. After the host selects a script and scene, all users see available roles listed by part size (biggest characters first, then narrator)
2. User taps **"Select Role"** → sees the role list → picks a character
3. Selecting a role **removes it from the pool** for others in real-time
4. User can select **additional characters** while they remain available
5. Once you have **at least 1 role**, the **"Mark as Ready"** button appears
6. Marking ready **returns you to Backstage** with your ready state shown
7. **Unreadying releases your role(s)** back to the pool — you must go through Select Role again (your previous role may have been taken by someone else)
8. **Narration** is split among remaining users without a character, OR shared by users who have a character and also want to narrate

### Design Implications

- Replaces the passive "Roles assigned when rehearsal starts" message with active participation
- Gives non-host users something meaningful to do during the callsheet stage
- Readiness becomes meaningful ("I have my role, I'm good to go") rather than arbitrary
- Creates natural social dynamics (racing for preferred roles, negotiating)

### Scope Note

This is documented in full detail here as requested. No assumption of a separate PRD at this stage.

---

## Point 5: Mark as Ready

**Critique**: No unready toggle (permanent once tapped). Ready state invisible to self after marking (need to scroll up to see the green dot in the cast section). The button asks users to commit before they have anything to commit to.

**Case for change**: Readiness is premature in the current design — you're saying "I'm ready" when you don't even know your role yet. The role draft flow reorders this so readiness becomes meaningful. An unready option is needed since circumstances change (someone joins late, you want to switch roles).

**Case for keeping**: No-unready patterns are standard in gaming lobbies. Cost of accidental ready-up is near zero since only the director can start. Adding unready increases complexity.

**Verdict**: **Change — restructure the flow.**
- "Mark as Ready" as currently designed is **replaced by "Select Role"** as the primary action
- After selecting at least one role, **"Mark as Ready" appears** in this section
- **Unready is supported** — unreadying releases your role(s) back to the pool, forcing re-selection through "Select Role" again (role may be taken by someone else in the meantime)

---

## Point 6: Start Rehearsal

**Critique**: No confirmation dialog (one tap starts for everyone). Button hierarchy is potentially confusing (Ready and Start look similar weight). No progress feedback during matchmaking.

**Case for change**: One accidental tap starts rehearsal for the entire room with no undo. This is a high-risk single-tap action affecting all participants.

**Case for keeping**: Confirmation dialogs slow down every start, not just accidental ones. Directors are power users who know what they're doing. The ready counter "(0/1 ready)" already signals "are you sure?" implicitly. Matchmaking is fast (<2 seconds typically), so progress feedback adds little.

**Verdict**: **Keep as-is.**
- Start Rehearsal button: no confirmation needed
- Button hierarchy: fine as-is
- The real change is the flow around it — after selecting a role and marking ready, user returns to Backstage with ready state shown. The readiness flow from Points 4-5 provides the natural "are you sure?" moment.

---

## Point 7: Page Structure (Creator vs Non-Creator)

**Critique**: ~400 lines of duplicated call sheet code between creator and non-creator views. Non-creator experience is passive and anxious — three "Waiting for the director..." messages at different stages. Non-creators see less info than creators.

**Case for change**: Non-hosts have nothing to do during setup. They stare at "waiting" messages. A live view of the host's selection process would keep them engaged and informed.

**Case for keeping**: Script/scene selection is fast — a few seconds of "waiting" is normal. The role drafting flow (Point 4) solves non-host passivity at the callsheet stage, which is where the longest wait happens. Live view of selection is a nice-to-have, not critical.

**Verdict**: **Defer.**
- **Non-host live view**: Marked as "cool to have" future feature. Script selection must be explored, implemented, and stabilised before providing a live view of the host's choices.
- **Code duplication**: Engineering concern, not a design debate item. Will be addressed as part of implementation.
- **Non-host passivity at callsheet stage**: Solved by role drafting — everyone picks their own roles.

---

## Point 8: Mobile Usability

**Critique**: Action buttons scroll off-screen with more participants. No step progress indicator for the 3-stage flow. No back/leave navigation — users must rely on browser back.

**Case for change**: Missing the start button because it's scrolled off is a real failure mode in a group setting. No visible "Leave Room" option is a problem, especially for non-hosts who may want to exit cleanly.

**Case for keeping**: Sticky footers eat screen space on already-cramped mobile screens. Page content already makes it obvious what stage you're at. Browser back button works for leaving.

**Verdict**:
- **Add "Leave Room" button** — needed for clean exit, especially for non-hosts.
- **Defer sticky footer** — address only when it visibly becomes an issue with real group sizes.
- **Defer step indicator** — not critical enough to add now.

---

## Summary of Changes

| # | Element | Verdict | Action |
|---|---------|---------|--------|
| 1 | Header Bar | No change | — |
| 2 | Room Code Header | Change | Rename "Waiting Room" → "Backstage" |
| 3 | Cast Section | Partial change | Add "(you)" label |
| 4 | Auto-Match Summary | Investigate + Change | Research Candidate Scenes & Coverage; rename "Change Mode" → "Change Scene"; role drafting flow replaces passive role assignment |
| 5 | Mark as Ready | Change | Replaced by "Select Role" → then "Mark as Ready" appears; unready releases roles |
| 6 | Start Rehearsal | No change | Keep as-is |
| 7 | Page Structure | Defer | Non-host live view is cool-to-have; role draft solves callsheet passivity |
| 8 | Mobile Usability | Partial change | Add "Leave Room" button |

### Deferred Items

- Script placement redesign (Point 2) — until multi-script exists
- Dot legend for cast section (Point 3) — until larger groups tested
- "Chunks" terminology rename (Point 4) — cross-cutting site-wide decision
- Candidate Scenes / Avg Coverage stats (Point 4) — pending matchmaking research
- Non-host live view of host selections (Point 7) — after script selection is stabilised
- Sticky footer (Point 8) — when scroll-off becomes a visible issue
- Step progress indicator (Point 8) — not critical now

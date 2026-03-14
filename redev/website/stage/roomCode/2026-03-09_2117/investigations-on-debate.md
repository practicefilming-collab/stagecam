# /stage/[roomCode] — Investigations on Debate

**Date**: 2026-03-09
**Follows**: [`debate-on-critical-analysis.md`](./debate-on-critical-analysis.md) — two items from Point 4 were marked "Investigate" and are resolved here

---

## Investigation 1: "Candidate Scenes" (110)

**Question from debate**: What does this number represent? Is the stat useful or just poorly labelled?

### Findings

**Source**: `src/lib/matchmaking/index.ts` → `getAutoPreviewStats()`, line ~185
**API**: `src/app/api/rooms/[roomId]/preview/route.ts`

The number is simply `scenes.length` — a raw count of every scene in the selected script (or act, if filtered). No filtering by coverage, group size suitability, or any other quality criteria. It's the total pool the auto-selector will choose from.

**What "110 Candidate Scenes" actually means**: "There are 110 scenes in this script that the algorithm could pick from."

### Assessment

- **Not useful in its current form.** Users don't need to know the pool size — they need to know the system will pick a good scene. Showing "110" creates anxiety ("how does it choose from 110?") without giving actionable information.
- **Not inaccurate**, just irrelevant at this stage. It's a backend detail surfaced as a user-facing stat.
- A better replacement might be no stat at all, or something like the name/number of the scene the system plans to select.

### Verdict

**Remove or replace.** The raw pool size doesn't help users. If a scene-related stat is shown, it should describe the outcome (which scene was picked and why) rather than the input (how many scenes exist).

---

## Investigation 2: "Avg Coverage" (3%)

**Question from debate**: Why is this shown at the waiting room stage? Is something more useful possible?

### Findings

**Source**: `src/lib/matchmaking/index.ts` → `getAutoPreviewStats()`, lines ~176-178
**Calculation**:
```
totalRecorded = sum of recorded chunks across ALL candidate scenes
totalPerformable = sum of rehearsable chunks (is_system=false) across ALL candidate scenes
avgCoverage = totalRecorded / totalPerformable
```

**What "3% Avg Coverage" actually means**: "Across all 110 scenes in the script, 3% of the performable content has been recorded so far."

This is a **corpus-level progress stat** — it tells you how much of the entire script has been covered by all recordings to date. It is *not* coverage of the scene you're about to rehearse.

### Assessment

- **Misleading framing.** "3%" reads as failure ("we're only 3% ready?") when it's actually normal for a large script. A 110-scene script with a few recordings will always show a low number.
- **Wrong granularity.** Users care about the scene they're about to perform, not the entire script's recording history.
- **Useful as a progress tracker, but not here.** This stat belongs on a script-level dashboard ("how much of Toy Story have we recorded?"), not on the waiting room where it creates pre-rehearsal anxiety.
- The auto-selector picks scenes strategically (favouring low-coverage scenes), so the actual scene chosen will likely have *lower* coverage than this average — making the stat doubly misleading.

### Verdict

**Remove from the waiting room.** This is a valid metric but belongs on a script progress/stats page, not the pre-rehearsal screen. If coverage is shown here, it should be the coverage of the *selected scene*, shown after scene selection — not a corpus average shown before.

---

## Summary of Investigation Outcomes

| Stat | Current Meaning | Useful Here? | Recommendation |
|------|----------------|--------------|----------------|
| Candidate Scenes | Raw scene count in script | No | Remove — backend detail, not user-facing info |
| Avg Coverage | Corpus-wide recording progress | No (wrong context) | Move to a script progress page; if shown here, show selected scene's coverage instead |

Both stats are technically accurate but are **corpus-level backend metrics surfaced in a user-facing context where they create confusion**. Neither helps users understand or prepare for the upcoming rehearsal.

---

## Broader Conclusion: Auto Mode Should Show the Pick, Not the Pool

The root problem isn't bad labels — it's that auto mode is showing users the *selection process* instead of the *selection result*. Users don't need to see how many scenes were considered or what the average coverage is across 110 scenes. They need to see which scene was picked.

**Current flow**: Host confirms auto mode → stats about the pool are displayed (candidate count, avg coverage, chunks per person) → roles assigned at rehearsal start.

**Proposed flow**: Host confirms auto mode → the system picks the best scene immediately → the selected scene is displayed by name (e.g. "Scene 14: Andy's Room") → users proceed to role drafting for that scene.

This eliminates the need for all three pool stats. The auto-picker does its job behind the scenes, and the user sees the outcome — the same way a search engine shows results, not how many pages it crawled.

If any stats are shown, they should describe the **selected scene**: its name, how many roles it has, and optionally its current coverage — information that's directly relevant to what's about to happen.

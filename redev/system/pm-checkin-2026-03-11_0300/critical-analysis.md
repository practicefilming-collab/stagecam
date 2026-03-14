# Critical Analysis: PM Check-In System

**Session**: 2026-03-11_0300
**Type**: System / Infrastructure

---

## 1. The Problem

No automated oversight of work in progress. Specific gaps:

- **Local changes drift without prioritization.** Modified, staged, and untracked files accumulate without periodic inventory. No mechanism to surface what's changed since the last intentional checkpoint.
- **Commits bypass the PRD process.** The push-approvals process requires `PRD:` references in commit messages and PUSHES.md tracking, but nothing enforces or audits this. Orphan commits — those not linked to any approved PRD — go undetected until someone manually checks.
- **PRD reviews lack awareness of in-flight work.** The review process checks recent git history, but a reviewer has no structured summary of what's actively being worked on, what's stalled, or what's drifted from the PRD plan.
- **No continuity between work sessions.** When work resumes after hours or days, there's no snapshot of where things stood. Context is reconstructed from memory and `git status`.

## 2. The Proposed Solution

A 3-hour automated check-in system that runs via Windows Task Scheduler, invoking Claude in read-only plan mode to produce structured reports.

**Core components:**
- `pm/run-checkin.ps1` — PowerShell orchestrator triggered by scheduler or manually
- `pm/checkin-prompt.md` — The prompt Claude executes, producing an 8-section report
- `pm/logs/` — Daily log folders with prepended entries (most recent first)
- Windows Task Scheduler job at 3-hour intervals (00:00, 03:00, ..., 21:00)

**Report sections:**
1. Local Change Inventory — file-level diff summary mapped to PRDs
2. Unpushed Commits — push/amend/hold recommendations
2b. Orphan Commit Audit — commits not linked to any approved PRD
3. PRD Board Snapshot — queue state, in-review duration, phase completion
4. PRD Review Guidance — alignment assessment for PRDs in review
5. Priority Assessment — ranked next-actions with dependencies
6. Commit Advice — grouping, messages, split/squash recommendations
7. WIP Status Summary — one-line per active PRD, ad-hoc flags
8. Timeline Cross-Reference — delta against previous entries, pattern analysis

**Key design decisions:**
- Read-only enforcement via `claude --print --permission-mode plan`
- Catch-up detection for missed scheduled runs (machine was off)
- Manual trigger support with distinct tagging
- Logs are local-only (gitignored), not committed to the repository

## 3. Impact on Existing Systems

### PRD Board
- Adds a **5th data source** to the review process. Currently: recent commits, requests queue, the PRD itself, and approved PRDs. The PM check-in log would provide structured WIP context during reviews.
- `prd-board/in-review/review.md` would reference PM logs as supplementary input.

### redev/
- Introduces `redev/system/manual-commits/` as an intake path for orphan commits flagged by check-ins. Each orphan gets a critical analysis before optionally becoming a PRD.
- This is the first system-type research artifact, validating the `website/` vs `system/` split.

### .gitignore
- `pm/logs/` added. Logs are local working data, not project artifacts.

### New top-level folder
- `pm/` is a new top-level directory alongside `src/`, `redev/`, `prd-board/`, etc.

## 4. Queue Awareness

**Current PRD board state (2026-03-11T03:00:00Z):**
- **Requests**: Empty (0 queued)
- **In review**: Empty (nothing under review)
- **Approved**: 4 PRDs, all fully committed (PUSHED- prefix)
- **Denied**: None

The board is clear. No queued PRDs would conflict with or be blocked by this work. No in-flight PRDs would have their assumptions invalidated.

Recent git history shows active development on pick mode features, social auth, and stats — all website-facing work. This system PRD is orthogonal to all of it.

## 5. Recommendation

**Proceed to PRD.** Reasoning:

- The board is empty — no queue contention, no risk of blocking higher-priority work
- The system addresses a real gap: as the PRD board grows, the lack of automated WIP oversight becomes increasingly costly
- The implementation is self-contained: a new `pm/` folder with no modifications to application code
- The only existing-file modifications are additive: `.gitignore` (one line) and `review.md` (one paragraph)
- Risk is low: if the system proves unhelpful, it can be disabled by removing the scheduled task with no codebase impact

**Scope**: Full implementation as described. No phasing needed — the components are tightly coupled (the scheduler is useless without the prompt, the prompt is useless without the log structure).

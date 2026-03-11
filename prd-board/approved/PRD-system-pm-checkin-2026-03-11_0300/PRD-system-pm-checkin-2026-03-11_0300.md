# PRD: PM Check-In System

**Author**: redev session 2026-03-11_0300
**Type**: System / Infrastructure
**Status**: Draft

---

## 1. Background

The project has a PRD board for tracking what should be built and a research workspace for analysis. What's missing is automated oversight of work in progress.

Local changes and unpushed commits drift without prioritization. Commits can bypass the PRD process with no catch mechanism. PRD reviews lack awareness of in-flight work. There is no continuity mechanism between work sessions — context is reconstructed from memory and `git status`.

**Research chain**:
- [`critical-analysis.md`](../../redev/system/pm-checkin-2026-03-11_0300/critical-analysis.md) — evaluated the problem, proposed solution, impact on existing systems, queue state, and recommendation to proceed

---

## 2. Current Implementation

There is no existing PM check-in system. The current oversight relies on:

1. **Manual `git status`/`git log`** — ad-hoc, no structure
2. **PRD board review process** — checks recent commits and queue during review, but only when a PRD is actively in review
3. **`COMMITS.md` tracking** — tracks implementation progress per approved PRD, but only updated manually
4. **Commit-approvals process** — bash script to scan for incomplete phases, but must be run manually

No automated, periodic assessment of project state exists.

---

## 3. Proposed Changes

### 3.1 New `pm/` Directory

A new top-level `pm/` folder containing the check-in system:

```
pm/
  README.md              ← usage guide with setup/teardown commands
  checkin-prompt.md      ← the prompt Claude executes each check-in
  run-checkin.ps1        ← PowerShell script that orchestrates everything
  logs/                  ← daily check-in logs (gitignored, local only)
```

### 3.2 PowerShell Orchestrator (`run-checkin.ps1`)

Accepts `-Trigger scheduled` (default) or `-Trigger manual`. Responsibilities:

1. Determine today's date, create `pm/logs/check-in-log-{date}/check-in-log-{date}.md` if it doesn't exist
2. Read `checkin-prompt.md` and pass it to `claude --print --permission-mode plan` (read-only)
3. Capture Claude's output, stamp with UTC timestamp and run type tag
4. **Prepend** the entry to today's log file (most recent first)

**Run type tags:**
- `[SCHEDULED]` — normal scheduled run
- `[MANUAL]` — human-initiated via command line
- `[SCHEDULED — CATCH-UP from HH:00]` — fired after machine wake-up, detected when last entry timestamp is >4h ago
- `[SCHEDULED — ERROR]` — Claude invocation failed, error captured

**Catch-up detection**: Reads the last entry's timestamp from today's log, compares to now. If >4h gap from last scheduled run, calculates the nearest missed 3-hour slot and tags accordingly.

### 3.3 Check-In Prompt (`checkin-prompt.md`)

Claude runs in read-only plan mode and produces an 8-section structured report:

**Section 1 — Local Change Inventory.** Every modified, staged, and untracked file. For each: change type, which PRD it likely belongs to (matching file paths against approved PRD scopes), size of change. Files not matching any PRD tagged "ad-hoc."

**Section 2 — Unpushed Commits.** `git log origin/master..HEAD`. For each: hash, message, files touched, which approved PRD phase it fulfills, whether to push as-is/amend/hold.

**Section 2b — Orphan Commit Audit.** Scans last 20 commits (pushed and unpushed), cross-references against every `COMMITS.md` in `prd-board/approved/` and commit messages for `PRD:` lines. Any commit appearing in neither is an orphan. Pushed orphans are highest priority — already in shared history without traceability. Unpushed orphans get amend advice. For all orphans, Claude considers PRD queue state before recommending new PRD creation.

**Section 3 — PRD Board Snapshot.** What's in review (and how long), which approved PRDs have unfinished phases (which phase is next), how many fully committed, what's queued in `requests/` with age of each.

**Section 4 — PRD Review Guidance.** If a PRD is in `in-review/`, Claude assesses it against the review's 4 alignment dimensions informed by the actual state of local work. Gives approve/deny/hold recommendation with reasoning.

**Section 5 — Priority Assessment.** Ranked list of what to work on next, with dependencies. Flags stalled PRD phases with explanation.

**Section 6 — Commit Advice.** Grouping, suggested messages (repo convention: imperative ≤72 chars, PRD reference in body), split recommendations, squash/reorder advice, notes to embed in commit messages.

**Section 7 — WIP Status Summary.** One-line per active PRD. Ad-hoc work flagged. Orphan commit intake status. Delta since last check-in.

**Section 8 — Timeline Cross-Reference.** Delta comparison against previous 2-3 entries. PRD board movements. Commits pushed. Pattern observations. Practical revision advice.

### 3.4 Windows Task Scheduler Job

Runs at fixed 3-hour intervals — 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00:

```
schtasks /create /tn "StageCam-CheckIn" /sc DAILY ^
  /tr "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\Users\KYC\Desktop\stagecam\pm\run-checkin.ps1\" -Trigger scheduled" ^
  /st 00:00 /ri 180 /du 24:00 /rl HIGHEST /f
```

Configured with "Run task as soon as possible after a scheduled start is missed" so that if the machine was off, it fires on wake-up as a catch-up run.

### 3.5 Log Structure

```
pm/logs/
  check-in-log-2026-03-12/
    check-in-log-2026-03-12.md
  check-in-log-2026-03-13/
    check-in-log-2026-03-13.md
```

One folder per day, one file per day. Entries prepended (most recent first). Script creates folder/file on new day.

**What Claude reads for context:**
- Today's log: 2-3 most recent entries
- Previous day's log: last 2-3 entries (if first check-in of the day)
- `pm/logs/` folder listing: day count and gap detection (for pattern analysis)

### 3.6 Integration with PRD Review Process

Add PM check-in logs as a **5th data source** in `prd-board/in-review/review.md`. When reviewing a PRD, the reviewer also consults the most recent check-in for WIP context.

### 3.7 Orphan Commit Intake Path

When check-ins flag orphan commits (commits not linked to any approved PRD), the resolution path is:

```
PM check-in flags orphan → redev/system/manual-commits/{hash}_{date}/
  → critical-analysis.md (queue-aware) → optional PRD → prd-board/requests/
```

This creates `redev/system/manual-commits/` as needed. Each orphan gets a critical analysis evaluating whether it should be retroactively linked to an existing PRD or whether a new PRD should be created, considering current queue state.

---

## 4. API Changes Summary

No application API changes. This system operates entirely outside the web application — it reads git state, file system, and PRD board artifacts.

---

## 5. Frontend Changes Summary

No frontend changes. This is an infrastructure/tooling system.

---

## 6. Visual Spec

N/A — no UI components.

---

## 7. Implementation Order

| Phase | Scope | Files | Risk |
|-------|-------|-------|------|
| 1 | Create `pm/` directory with `README.md`, `checkin-prompt.md`, `run-checkin.ps1`, and `logs/` | `pm/README.md`, `pm/checkin-prompt.md`, `pm/run-checkin.ps1` | Low — new files only |
| 2 | Modify `.gitignore` and `prd-board/in-review/review.md` | `.gitignore`, `prd-board/in-review/review.md` | Low — additive changes to existing files |
| 3 | Register Windows Task Scheduler job, test manual and scheduled runs | System-level | Low — reversible with `schtasks /delete` |

**Phase 1** is the core delivery. **Phase 2** integrates with existing systems. **Phase 3** activates automation.

---

## 8. Out of Scope

| Item | Reason for deferral |
|------|---------------------|
| Weekly summary runs | Separate prompt reading all 7 daily logs — future enhancement once daily logs prove valuable |
| Log archival | After 30+ days, old daily logs could move to `archive/` — premature to build now |
| Cross-day pattern analysis beyond 2-day window | Future prompt enhancement once sufficient log history exists |
| Dashboard or web UI for check-in data | This is a CLI-based system by design — no web interface needed |
| Automatic commit creation based on check-in advice | Check-ins are advisory only — human executes all actions |

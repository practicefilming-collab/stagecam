# In-Review Process

This folder holds the single PRD currently under active review. The review is an **alignment check**, not a quality judgment — by the time a PRD reaches the board, its content has already been vetted through the redev process (screenshot → critical analysis → PRD).

The question is not "is this PRD good?" but "does this PRD fit with what's been built and what's queued?"

## What the Reviewer Checks

The reviewer reads these sources before producing a verdict:

1. **Recent git commit history** — what has actually shipped (last ~20 commits)
2. **The requests queue** — what other PRDs are waiting in `requests/`
3. **The PRD under review** — what it proposes to change
4. **Approved PRDs** — what's been approved, which phases are complete or in progress
5. **PM check-in logs** (if available) — the most recent check-in from `pm/logs/` provides structured WIP context: local changes mapped to PRDs, orphan commits, stalled phases, and priority assessment

## Alignment Dimensions

The assessment evaluates four dimensions:

### 1. Commit Conflicts

Does this PRD modify something that was just shipped or is mid-flight? If a recent commit touched the same files, APIs, or features, there may be a collision — the PRD might be working against freshly landed code or making assumptions about state that no longer holds.

### 2. Queue Conflicts

Does this PRD contradict or duplicate another PRD sitting in `requests/`? Two PRDs proposing different redesigns of the same component, or one PRD that would invalidate the assumptions of another, signals a conflict that needs resolution before either lands.

### 3. Direction Alignment

Does this PRD move the product forward coherently given the recent development trajectory? If the last 10 commits have been hardening the export pipeline, a PRD that rips out export internals is swimming against the current. The PRD should build on momentum, not fight it.

### 4. Dependency Order

Should another queued PRD land first because this one depends on it or would conflict? If PRD-A adds an API field that PRD-B assumes exists, PRD-B should wait. Check whether the PRD under review has implicit dependencies on queued work.

## Producing the Verdict

After evaluating all four dimensions, the reviewer writes a formal assessment and delivers one of two verdicts: **approved** or **denied**.

### If approved:

Create `APPROVED.md` inside the PRD folder with:
- UTC timestamp of approval
- The four-dimension assessment (brief, one or two sentences each)
- Any conditions, scope adjustments, or phasing notes
- Summary of what was approved

Then move the PRD folder to `approved/`. Create `PUSHES.md` inside the folder to track implementation.

### If denied:

Create `DENIED.md` inside the PRD folder with:
- UTC timestamp of denial
- The four-dimension assessment showing where alignment failed
- Specific issues that caused rejection
- Whether a revised PRD should be resubmitted and what would need to change

Then move the PRD folder to `denied/`.

## Operational Rules

### 1. One at a time

This folder must contain exactly **one** PRD folder at any given time (or be empty if nothing is under review). Never move a second PRD in while one is already here.

### 2. Pull from requests (FIFO)

When this folder is empty and `requests/` has PRDs waiting, move the **oldest** PRD folder (by the date in its folder name) into `in-review/`. Log the intake in `review-log.md`.

### 3. Log every intake

When a PRD folder is moved into `in-review/`, append an entry to `review-log.md` in this directory:

```markdown
## PRD-{page}-{YYYY-MM-DD_HHMM}

- **Moved to review**: {UTC timestamp, e.g. 2026-03-09T19:00:00Z}
- **Source**: requests/PRD-{page}-{YYYY-MM-DD_HHMM}/
- **Status**: in review
```

Update the entry's status when the review concludes.

### 4. Update the log

After moving the folder out, update its `review-log.md` entry:

```markdown
- **Status**: approved → moved to approved/
- **Completed**: {UTC timestamp}
```

or

```markdown
- **Status**: denied → moved to denied/
- **Completed**: {UTC timestamp}
```

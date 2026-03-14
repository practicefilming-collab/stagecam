# PRD Board

Intake and processing system for product requirement documents. PRDs originate from the `redev/` research workspace and flow through this board for review.

## End-to-End Workflow

### 1. Research (`redev/`)

Research is organized into two domains:

- **`redev/website/`** — website page research (screenshots, UI analysis, page-level PRDs)
- **`redev/system/`** — infrastructure and tooling research (automation, processes, developer workflows)

#### Website research sessions

Each page gets a dedicated research session:

```
redev/website/{page}/{YYYY-MM-DD_HHMM}/
  ├── screenshot.jpeg          ← snapshot of the page's current state
  ├── critical-analysis.md     ← critique, issues ranked by severity
  └── PRD-{page}-{date}.md    ← if approved for work, a full PRD is written
```

#### System research sessions

Each topic gets a dedicated research session:

```
redev/system/{topic}-{YYYY-MM-DD_HHMM}/
  ├── critical-analysis.md     ← evaluation of the problem and proposed solution
  └── PRD-system-{topic}-{date}.md  ← if approved for work, a full PRD is written
```

The session folder stays in `redev/` permanently as the source-of-truth research artifact.

### 2. Board (`prd-board/`)

When a PRD is written in `redev/`, it gets copied into the board for processing. Each PRD lives in its own folder so companion files (review notes, commit tracking, denial writeups) stay grouped together:

```
prd-board/
├── requests/                              ← queue (FIFO by folder name date)
│   └── PRD-stats-me-2026-03-09_1830/
│       └── PRD-stats-me-2026-03-09_1830.md
├── in-review/                             ← one PRD at a time
│   ├── review.md                          ← rules for this stage
│   ├── review-log.md                      ← log of every PRD that enters review
│   └── PRD-example-2026-03-05_1400/
│       └── PRD-example-2026-03-05_1400.md
├── approved/
│   └── PRD-example-2026-03-01_1200/
│       ├── PRD-example-2026-03-01_1200.md
│       ├── APPROVED.md
│       └── PUSHES.md
└── denied/
    └── PRD-example-2026-02-15_0900/
        ├── PRD-example-2026-02-15_0900.md
        └── DENIED.md
```

## Processing Rules

### FIFO ordering

PRDs are processed in order by the date embedded in their folder name. Oldest first.

### Naming convention

Folder and file share the same name:

```
PRD-{page}-{YYYY-MM-DD_HHMM}/
  └── PRD-{page}-{YYYY-MM-DD_HHMM}.md
```

- **Website PRDs**: `{page}` is the page path with slashes replaced by dashes (e.g., `stats-me`). Traces back to `redev/website/{page}/{date}/`.
- **System PRDs**: `{page}` is `system-{topic}` (e.g., `system-pm-checkin`). Traces back to `redev/system/{topic}-{date}/`.
- `{YYYY-MM-DD_HHMM}` — timestamp of the redev session it originated from

This naming enables FIFO sort and traces every PRD back to its source.

### In review

Only **one** PRD may be in `in-review/` at a time. When the folder is empty, pull the oldest PRD from `requests/` and log the intake in `in-review/review-log.md` with a UTC timestamp.

The review is an **alignment check**, not a quality judgment. By the time a PRD reaches the board, its content has been vetted through the redev process. The reviewer reads recent git history, the requests queue, and the PRD itself, then assesses four dimensions:

1. **Commit conflicts** — does this change collide with recently shipped work?
2. **Queue conflicts** — does this contradict or duplicate another queued PRD?
3. **Direction alignment** — does this move the product forward coherently?
4. **Dependency order** — should another queued PRD land first?

See `in-review/review.md` for the full process.

### On approval

1. Create `APPROVED.md` inside the PRD folder with UTC timestamp, approval summary, and any conditions.
2. Move the PRD folder from `in-review/` to `approved/`.
3. Create `PUSHES.md` inside the folder to track every pushed commit that implements the PRD — hash, message, and what part of the PRD it addresses. Updated as implementation progresses.
4. Update the entry in `in-review/review-log.md`.

### On denial

1. Create `DENIED.md` inside the PRD folder with UTC timestamp, full explanation of rejection, and whether resubmission is warranted.
2. Move the PRD folder from `in-review/` to `denied/`.
3. Update the entry in `in-review/review-log.md`.

## Traceability

Every PRD folder name maps directly back to its research session:

```
# Website PRD
prd-board/requests/PRD-stats-me-2026-03-09_1830/
  → redev/website/stats/me/2026-03-09_1830/
      ├── screenshot.jpeg
      ├── critical-analysis.md
      └── PRD-stats-me-2026-03-09_1830.md  (original)

# System PRD
prd-board/requests/PRD-system-pm-checkin-2026-03-11_0300/
  → redev/system/pm-checkin-2026-03-11_0300/
      ├── critical-analysis.md
      └── PRD-system-pm-checkin-2026-03-11_0300.md  (original)
```

The `redev/` copy is the research artifact. The `prd-board/` copy is the operational document that moves through the review pipeline.

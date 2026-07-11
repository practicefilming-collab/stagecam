# PRD: Async Pipeline Resilience (clip ingestion + AI line generation)

**Author:** redev session 2026-07-08_0500
**Type:** System / Generation Pipeline & Data Integrity
**Status:** Draft
**Source:** `redev/system/full-audit-2026-07-08_0500/` (F-8..F-13, F-16, F-17, F-18)

## 1. Background

StageCam has two multi-stage async pipelines — clip ingestion and AI line generation — that
lack durable failure handling. Failures are silently swallowed or leave records in
inconsistent, unrecoverable states, and the generation watchdog cannot see partially-stuck
work. There is no automated test coverage to catch regressions in either.

## 2. Current implementation

**Clip pipeline** (`src/lib/clips/pipeline/`): `orchestrator.ts` runs download → extract →
analyze → segments; stages advance `pipeline_status` and write artifacts to R2.

**AI generation** (`src/lib/generation/`): `execute.ts`/`runner.ts` move each line
pending → interpreted → synthesized → persisted; `jobs.ts` aggregates run totals;
`watchdog.ts` retries stalled work.

### Confirmed defects
| ID | Location | Defect |
|----|----------|--------|
| F-8 | `clips/pipeline/analyze.ts:288-291` | Whisper failure swallowed → `{ segments: [] }` treated as success. |
| F-9 | `clips/pipeline/orchestrator.ts:14-46` | No retry/resume; failed clip is permanently dead, R2 artifacts orphaned. |
| F-10 | `clips/pipeline/extract.ts:79`, `download.ts:74` | Status advanced before confirming all artifacts uploaded → inconsistent state. |
| F-11 | `clips/pipeline/analyze.ts:310-320,263-269` | Segment insert not error-checked; `duration ?? 0` → `ready_for_review` with no/zero segments. |
| F-12 | `generation/execute.ts:337-399` | Recording inserted but `persisted` status update can fail → orphaned recording, line stuck at `synthesized`. |
| F-13 | `generation/watchdog.ts:112,137` | Watchdog scans only job statuses `queued/processing/failed`; lines stuck `interpreted`/`synthesized` never recovered. |
| F-16 | `generation/execute.ts:309-325` | Grok interpretation failure silently falls back to heuristic, no error flag. |
| F-17 | `generation/watchdog.ts:209` | Future `lastKickoffAt` (clock skew) → permanent cooldown, jobs never retried. |
| F-18 | `generation/jobs.ts:102-104` | Aggregates not bounded to `total_lines` → progress overflow on corrupt record. |

## 3. Proposed changes

### 3.1 Explicit terminal-vs-retryable failure states
Both pipelines: replace silent catches (F-8, F-16) with recorded failure states that
distinguish *retryable* (transient API/network) from *terminal* (bad input). Persist an error
reason on the row. Never let an empty/default result masquerade as success.

### 3.2 Idempotent, checkpointed stages + cleanup
Advance status only after all artifacts for a stage are confirmed (F-10). On terminal failure,
best-effort clean up orphaned R2 objects and record what was left (F-9). Make stages
re-runnable so a stuck clip/line can be resumed rather than abandoned.

### 3.3 Atomic finalisation of generated recordings
Insert-recording + mark-persisted must be one transaction or an idempotent upsert keyed so a
failed second step can be safely retried (F-12) — no orphaned recordings, no permanent
`synthesized`.

### 3.4 Watchdog covers line-record statuses + robust cooldown
Extend watchdog queries to detect line records stuck in `interpreted`/`synthesized` past a
threshold and re-drive or fail them (F-13). Fix cooldown to clamp future timestamps / use a
monotonic comparison (F-17). Validate aggregates against `total_lines` (F-18).

### 3.5 Structured logging on every swallowed path
Every current empty catch logs a structured error so failures are observable even before
tests exist.

## 4. Rationale
These are data-integrity defects: users get clips with no captions and AI lines that silently
never persist, with no recovery path and no signal. Making failures explicit, recoverable,
and observable is prerequisite to trusting both pipelines.

## 5. Phases
1. Observability: structured logging on all swallowed catches (§3.5) — low risk, immediate.
2. State model: terminal-vs-retryable + checkpointing + cleanup (§3.1, §3.2).
3. Atomic recording finalisation (§3.3).
4. Watchdog coverage + cooldown/aggregate fixes (§3.4).

## 6. Risks / dependencies
- Touches the live generation path; roll out behind the watchdog and verify no double-processing
  (current claim logic at `admin/ai/process/route.ts:77` is non-atomic — validate under §3.3/§3.4).
- Needs the testing-infrastructure PRD to lock in regression coverage.

## 7. Verification
- Force each failure (kill Whisper, fail an R2 upload, fail the persist step) and confirm the
  row lands in a labelled, recoverable state and the watchdog re-drives it.
- Confirm no orphaned R2 objects / recordings after induced failures.
- Aggregates never exceed `total_lines`.

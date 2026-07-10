# Findings Analysis — Lane Assignment

Triage of each finding in `report.md` into a redev lane, per `redev/redev-process.md`.

## Decision summary

| Finding(s) | Lane | Destination |
|------------|------|-------------|
| F-1, F-2 | **Quick-fix** | `redev/quick-fixes/website/stage/create/2026-07-08_0500/` |
| F-3, F-4, F-5, F-6, F-7 | **System PRD** | `PRD-system-script-privacy-enforcement-2026-07-08_0500` |
| F-8..F-13, F-16, F-17, F-18 | **System PRD** | `PRD-system-pipeline-resilience-2026-07-08_0500` |
| F-19, F-20, F-21 | **System PRD** | `PRD-system-upload-url-hardening-2026-07-08_0500` |
| F-14, F-15 | **System PRD** | `PRD-system-testing-infrastructure-2026-07-08_0500` |

## Reasoning

### Why F-1/F-2 are a quick-fix but F-3..F-7 are not
The reported symptom (F-1/F-2) is a two-line UI change: add `.eq('is_internal', false)` to
two client queries, matching the proven `/api/scripts` pattern. Small, safe, obvious → the
quick-fix lane, shippable immediately as a first-layer mitigation.

But the sweep showed the leak is an **attack chain with data/API risk**: even with the UI
filtered, a user who knows a private `script_id` can still create/patch a room (F-3/F-4) and
read full private content via the room GET (F-5), and client hooks/pages render it (F-6/F-7).
Per the quick-fix rule — *"If the critical analysis uncovers … data/API risk … the item
must leave the quick-fix path"* — the enforcement layer is **escalated to a system PRD**.
The quick-fix doc explicitly discloses this and points at the PRD, so shipping F-1/F-2 is not
mistaken for closing the hole.

### Why pipeline findings are one PRD
F-8..F-18 are all one coherent theme — **no durable failure handling in the two async
pipelines** (silent catches, no retry/resume, watchdog blind spots, orphaned records). They
share a design remedy (explicit terminal-vs-retryable states, idempotent stages, watchdog
coverage of line-record statuses) and are best specified together rather than piecemeal.

### Why upload-URL hardening is its own PRD
F-19/F-20 are a self-contained security topic (presigned-URL ownership + input validation)
with an existing correct pattern to generalise. F-21 (room-code exhaustion) is bundled in as
a small adjacent hardening item in the same PRD's scope.

### Why testing is a PRD, not done now (user decision)
F-14 (red lint) and F-15 (no tests) are the tooling gap. Per the locked decision, this
produces a **testing-infrastructure PRD** (runner + first critical-path tests + CI gating
that would also cover lint), rather than standing up the suite in this session.

## Board routing
All four PRDs are copied into `prd-board/requests/` (FIFO queue). They are **not**
self-approved — the board's in-review step assesses alignment. Suggested dependency/priority
order for the board (not enforced here):
1. `script-privacy-enforcement` (active data-exposure risk)
2. `upload-url-hardening` (abuse surface)
3. `pipeline-resilience` (data-integrity debt)
4. `testing-infrastructure` (enables safe landing of the above)

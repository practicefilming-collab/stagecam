# PRD: Testing Infrastructure & CI Gating

**Author:** redev session 2026-07-08_0500
**Type:** System / Tooling & Developer Workflow
**Status:** Draft
**Source:** `redev/system/full-audit-2026-07-08_0500/` (F-14, F-15)

## 1. Background

StageCam has **no automated test infrastructure**: no test runner, no `*.test.ts`/`*.spec.ts`,
no `test` script in `package.json`, and no CI gate. Every regression — including the
high-severity privacy and pipeline defects this audit found — currently relies on manual QA.
Separately, `npm run lint` is red (9 errors, 8 warnings) with nothing gating on it, so lint
regressions land freely. Without a safety net, the fixes proposed by the other three PRDs
can silently regress.

## 2. Current implementation

- `package.json` scripts: `dev`, `build`, `start`, `lint` only — no `test`.
- No runner deps (no vitest/jest/playwright/testing-library).
- `npm run build` passes; `npm run lint` fails:
  - 7× `react-hooks/set-state-in-effect` errors (clips pages + `rehearsal/loading-montage.tsx`,
    `montage-overlay-provider.tsx`),
  - `prefer-const` error in `src/lib/clips/pipeline/analyze.ts:223`,
  - unused-var warnings across `clips/pipeline/*`, `worker/server.js`.
- No CI workflow gating build/lint/tests on PRs.

## 3. Proposed changes

### 3.1 Adopt a test runner
Add **Vitest** (fast, TS-native, minimal config for a Next.js app) with a `test` script and a
`test:watch` script. Structure: unit tests colocated or under `src/**/__tests__`.

### 3.2 First critical-path unit tests (highest-risk pure logic first)
Prioritise the deterministic core logic that has no coverage today:
- `src/lib/matchmaking/*` (scene-selector, character-assigner, line-distributor, coverage) —
  pure assignment logic, high blast radius.
- `src/lib/generation/jobs.ts` aggregate math (guards F-18) and watchdog cooldown (F-17).
- A privacy predicate helper (from the script-privacy PRD) — assert internal scripts filtered.

### 3.3 Route/integration smoke tests
Add lightweight handler tests for the highest-risk API routes (rooms create/patch privacy,
upload-url ownership) so the other PRDs' fixes are pinned by regression tests.

### 3.4 CI gate
Add a CI workflow running `npm run build`, `npm run lint`, and `npm test` on PRs. Fix the
current 9 lint errors (§3.5) so the gate can be enforced rather than advisory.

### 3.5 Clear the existing lint backlog (F-14)
Resolve the `set-state-in-effect` and `prefer-const`/unused-var findings so lint is green and
can be gated. Mechanical items (`prefer-const`, unused vars) are trivial; the
`set-state-in-effect` items need small effect refactors.

## 4. Rationale
This PRD is the enabler for the other three: privacy, upload-URL, and pipeline fixes each
specify "add regression tests," which requires a runner and CI to exist. Establishing it now
converts one-off fixes into durable guarantees.

## 5. Phases
1. Runner + `test` script + one example test + CI workflow (build/lint/test).
2. Clear lint backlog so the gate is enforceable (§3.5).
3. Critical-path unit tests (§3.2).
4. Route smoke tests co-landed with the other PRDs' fixes (§3.3).

## 6. Risks / dependencies
- Vitest + Next config needs path-alias (`@/…`) resolution — small setup cost.
- Sequencing: land runner + CI before/alongside the other PRDs so their tests have a home.

## 7. Verification
- `npm test` runs and the example suite passes locally and in CI.
- `npm run lint` is green and the CI gate blocks a PR that reintroduces an error.
- Matchmaking/aggregate tests fail if their logic is broken (mutation spot-check).

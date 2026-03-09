# Commit-Approvals Process

How to find approved PRDs, implement them, and maintain traceability.

## Step 1 — Find Outstanding Approvals

Scan `prd-board/approved/*/COMMITS.md` for files with an empty table (no hash entries). These are approved PRDs with no implementation commits yet.

```bash
# Quick check: find COMMITS.md files with no hash rows
for f in prd-board/approved/*/COMMITS.md; do
  rows=$(grep -cE '^\| [0-9a-f]' "$f" 2>/dev/null || echo 0)
  if [ "$rows" -eq 0 ]; then echo "OUTSTANDING: $(dirname "$f" | xargs basename)"; fi
done
```

## Step 2 — Check GitHub for Prior Work

Before starting implementation, search for commits that may have already addressed the PRD (fully or partially) but weren't logged in COMMITS.md.

```bash
# Search commit messages for the PRD name
git log --grep="PRD-stats-me" --oneline

# Check recent changes to files the PRD targets
git log --oneline -10 -- src/app/\(protected\)/stats/me/page.tsx src/components/stats/role-call.tsx
```

Also use `gh search commits` if the repo is on GitHub. If prior work exists, note it in COMMITS.md retroactively before continuing.

## Step 3 — Implement and Commit

Work through the PRD's implementation phases. Each commit should be scoped to a logical unit (one phase or a natural subset). The commit follows repo convention:

- **Line 1**: Short summary (imperative mood, ≤72 chars)
- **Body**: Paragraph explaining what changed and why
- **Co-Authored-By trailer**: Name the department whose insight drove the PRD, e.g.:
  ```
  Co-Authored-By: StageCam Product Design <noreply@stagecam.cc>
  ```
  This gives the PRD's spirit authority in the commit history.

## Step 4 — Reference the PRD in Commit Description

Every commit body **must** include a line like:

```
PRD: PRD-stats-me-2026-03-09_1830
```

This is the traceability fallback — even if COMMITS.md gets lost or out of date, `git log --grep="PRD-stats-me"` will find every commit driven by that PRD.

## Step 5 — Update COMMITS.md

After each commit, append a row to the PRD's `COMMITS.md` table:

```
| <short-hash> | <summary> | Phase N |
```

Keep the table sorted chronologically (newest at bottom).

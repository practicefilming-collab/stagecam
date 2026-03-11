# Commit-Approvals Process

How to find approved PRDs, implement them, and maintain traceability.

## Step 1 — Find Outstanding Approvals

Scan `prd-board/approved/*/COMMITS.md` for two cases:

1. **No commits at all** — empty table, PRD never started.
2. **Partially complete** — commits exist but not all phases are covered. Cross-reference the phases listed in the PRD's Section 7 (Implementation Order) against the "PRD Phase" column in COMMITS.md.

```bash
# Check each approved PRD for missing phases
for dir in prd-board/approved/*/; do
  prd=$(basename "$dir")
  commits_file="$dir/COMMITS.md"
  prd_file=$(ls "$dir"/*.md 2>/dev/null | grep -v COMMITS | grep -v APPROVED | head -1)

  # Count committed phases — only lines with a real git hash (7+ hex chars)
  committed=$(grep -E '\| [a-f0-9]{7,} \|' "$commits_file" 2>/dev/null | grep -oE 'Phase [0-9]+' | sort -u | wc -l)

  # Count total phases from Section 7 (Implementation Order) table
  # Match rows under that heading — phases have scope/files/risk columns
  total=0
  if [ -n "$prd_file" ]; then
    total=$(sed -n '/## 7/,/## 8/p' "$prd_file" 2>/dev/null | grep -cE '^\| [0-9]+ \|' || echo 0)
  fi

  if [ "$committed" -eq 0 ]; then
    echo "NOT STARTED: $prd (0/$total phases)"
  elif [ "$committed" -lt "$total" ]; then
    done_phases=$(grep -E '\| [a-f0-9]{7,} \|' "$commits_file" | grep -oE 'Phase [0-9]+' | sort -u | tr '\n' ',' | sed 's/,$//')
    echo "IN PROGRESS: $prd ($committed/$total phases done: $done_phases)"
  else
    echo "COMPLETE: $prd ($committed/$total phases)"
  fi
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

## Step 6 — Mark Fully Committed PRDs

When all phases in a PRD's COMMITS.md are filled in (every phase from the PRD's Section 7 has at least one commit hash), prefix the folder name with `COMMITTED-`:

```
prd-board/approved/PRD-stats-me-2026-03-09_1830/
  → prd-board/approved/COMMITTED-PRD-stats-me-2026-03-09_1830/
```

This makes it easy to scan the `approved/` directory and see at a glance which PRDs still have outstanding work:

- **No prefix** — implementation in progress or not started
- **`COMMITTED-` prefix** — all phases shipped

The check from Step 1 still works on `COMMITTED-` folders (the inner files are unchanged), so historical traceability is preserved.

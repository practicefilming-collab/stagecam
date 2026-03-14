# Push-Approvals Process

How to find approved PRDs, implement them, and maintain traceability.

## Step 1 — Find Outstanding Approvals

Scan `prd-board/approved/*/PUSHES.md` for two cases:

1. **No pushes at all** — empty table, PRD never started.
2. **Partially complete** — pushes exist but not all phases are covered. Cross-reference the phases listed in the PRD's Section 7 (Implementation Order) against the "PRD Phase" column in PUSHES.md.

```bash
# Check each approved PRD for missing phases
for dir in prd-board/approved/*/; do
  prd=$(basename "$dir")
  # Skip INTERNAL PRDs — local-only, nothing to push
  [[ "$prd" == INTERNAL-* ]] && echo "INTERNAL: $prd" && continue
  pushes_file="$dir/PUSHES.md"
  prd_file=$(ls "$dir"/*.md 2>/dev/null | grep -v PUSHES | grep -v APPROVED | head -1)

  # Count pushed phases — only lines with a real git hash (7+ hex chars)
  pushed=$(grep -E '\| [a-f0-9]{7,} \|' "$pushes_file" 2>/dev/null | grep -oE 'Phase [0-9]+' | sort -u | wc -l)

  # Count total phases from Section 7 (Implementation Order) table
  # Match rows under that heading — phases have scope/files/risk columns
  total=0
  if [ -n "$prd_file" ]; then
    total=$(sed -n '/## 7/,/## 8/p' "$prd_file" 2>/dev/null | grep -cE '^\| [0-9]+ \|' || echo 0)
  fi

  if [ "$pushed" -eq 0 ]; then
    echo "NOT STARTED: $prd (0/$total phases)"
  elif [ "$pushed" -lt "$total" ]; then
    done_phases=$(grep -E '\| [a-f0-9]{7,} \|' "$pushes_file" | grep -oE 'Phase [0-9]+' | sort -u | tr '\n' ',' | sed 's/,$//')
    echo "IN PROGRESS: $prd ($pushed/$total phases done: $done_phases)"
  else
    echo "COMPLETE: $prd ($pushed/$total phases)"
  fi
done
```

## Step 2 — Check GitHub for Prior Work

Before starting implementation, search for commits that may have already addressed the PRD (fully or partially) but weren't logged in PUSHES.md.

```bash
# Search commit messages for the PRD name
git log --grep="PRD-stats-me" --oneline

# Check recent changes to files the PRD targets
git log --oneline -10 -- src/app/\(protected\)/stats/me/page.tsx src/components/stats/role-call.tsx
```

Also use `gh search commits` if the repo is on GitHub. If prior work exists, note it in PUSHES.md retroactively before continuing.

## Step 3 — Implement Freely

Work through the PRD's implementation phases. Commit locally as needed — commits are free, amendable, and squashable. Agents and developers commit as they go with no ceremony. The only requirement is that commit messages follow repo convention:

- **Line 1**: Short summary (imperative mood, ≤72 chars)
- **Body**: Paragraph explaining what changed and why
- **Co-Authored-By trailer**: Name the department whose insight drove the PRD, e.g.:
  ```
  Co-Authored-By: StageCam Product Design <noreply@stagecam.cc>
  ```
  This gives the PRD's spirit authority in the commit history.

## Step 4 — Reference the PRD in Commit Messages

Every commit body **must** include a line like:

```
PRD: PRD-stats-me-2026-03-09_1830
```

This is the traceability backbone — even if PUSHES.md gets lost or out of date, `git log --grep="PRD-stats-me"` will find every commit driven by that PRD.

## Step 5 — Push Decision

Before pushing to origin, verify:

1. **All commits have `PRD:` references** in their bodies — run `git log origin/master..HEAD` and check each commit
2. **`npm run build` passes** — the push gate, not the commit gate
3. **No orphan commits** in the push batch — every commit traces to an approved PRD

If any check fails, fix locally (amend, rebase, add missing references) before pushing.

## Step 6 — Update PUSHES.md

After pushing, append a row to the PRD's `PUSHES.md` table for each pushed commit:

```
| <short-hash> | <summary> | Phase N |
```

Keep the table sorted chronologically (newest at bottom).

## Step 7 — Mark Fully Pushed PRDs

When all phases in a PRD's PUSHES.md are filled in (every phase from the PRD's Section 7 has at least one commit hash that has been pushed), prefix the folder name with `PUSHED-`:

```
prd-board/approved/PRD-stats-me-2026-03-09_1830/
  → prd-board/approved/PUSHED-PRD-stats-me-2026-03-09_1830/
```

This makes it easy to scan the `approved/` directory and see at a glance which PRDs still have outstanding work:

- **No prefix** — implementation in progress or not started
- **`PUSHED-` prefix** — all phases shipped to origin
- **`INTERNAL-` prefix** — all phases implemented but changes are local-only (gitignored tooling, config, infrastructure that doesn't push to GitHub)

The check from Step 1 still works on `PUSHED-` and `INTERNAL-` folders (the inner files are unchanged), so historical traceability is preserved.

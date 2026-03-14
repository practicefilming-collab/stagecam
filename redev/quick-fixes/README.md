# Quick Fixes

`redev/quick-fixes/` is the lightweight intake lane for obvious low-scope fixes that can be analyzed locally and, if they pass critical analysis, go straight to implementation, commit, and push without becoming PRDs.

## Structure

Use one of these patterns:

```text
redev/quick-fixes/website/{page-path}/{YYYY-MM-DD_HHMM}/
redev/quick-fixes/system/{topic}/{YYYY-MM-DD_HHMM}/
```

Examples:

```text
redev/quick-fixes/website/stage/roomCode/2026-03-14_1530/
redev/quick-fixes/system/login-flow/2026-03-14_1600/
```

## Required Files Per Session

Each quick-fix session should keep:

- the dropped item or items
- `quick-fix.md`
- `PUSHES.md` after implementation is pushed

`quick-fix.md` should explain:

- the proposed quick fix
- confidence in that fix
- why it appears small and safe
- critical analysis of reasons not to implement it
- the final decision: direct implementation or escalation to standard redev

# APPROVED

**Approved**: 2026-07-08T05:02:00Z

---

## Alignment Assessment

### 1. Commit Conflicts

**No blocking conflicts.** The last ~20 commits are heavily invested in the audition system
(`b1203d6`, `33ca8bf`, `fd86559`, `08c99b2`, etc.), which is exactly the feature this PRD
protects. Audition-derived scripts are `is_internal = true`; this PRD closes the leak that
lets that freshly-shipped private content escape into rooms. It hardens recent work rather
than undoing it. Note: `/api/rooms` (the primary change surface) has not been touched by
recent commits, so no mid-flight collision.

### 2. Queue Conflicts

**No conflicts.** The other three queued PRDs (upload-url-hardening, pipeline-resilience,
testing-infrastructure) are disjoint in scope. testing-infrastructure is complementary — it
will host this PRD's regression tests.

### 3. Direction Alignment

**Strong alignment.** The product is actively expanding paid/professional auditions, whose
core promise is privacy of submitted material. A room-code URL currently returning full
private script bodies directly contradicts that direction; fixing it is squarely on-trajectory.

### 4. Dependency Order

**Land first among the four.** This addresses the highest-severity, actively-exploitable data
exposure in the audit. testing-infrastructure ideally lands alongside so the fix ships with
regression coverage, but the security fix should not wait on it.

---

## Conditions

- Preserve assigned-rehearser access to their own `is_internal` scripts (audition flow in
  `src/lib/auditions/auth.ts`) — the filter must not lock legitimate viewers out.
- Ship the approved quick-fix (F-1/F-2 UI filters) independently as an immediate mitigation;
  it does not close the hole and must not be treated as completing this PRD.
- The RLS backstop (§3.4) is a migration — verify against existing audition relationships.

## Summary

Approved as the top-priority security fix. Directionally consistent with the ongoing auditions
build, no queue or commit conflicts, and phased so the write-boundary validation and read
narrowing can land ahead of the optional RLS backstop.

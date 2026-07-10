# PRD: Presigned Upload URL Hardening

**Author:** redev session 2026-07-08_0500
**Type:** System / API Security
**Status:** Draft
**Source:** `redev/system/full-audit-2026-07-08_0500/` (F-19, F-20, F-21)

## 1. Background

The presigned-URL endpoints issue write URLs to R2 without validating that the caller owns
the target resource, and without constraining the file extension or size. This is an
abuse/DoS surface: any authenticated user can mint upload URLs against arbitrary
`scriptId`/`clipId` values and control the object extension. A correct ownership + sanitisation
pattern already exists elsewhere and should be generalised.

## 2. Current implementation

- `src/app/api/recordings/upload-url/route.ts:15-24` — builds key
  `${scriptId}/${assetId}/${user.id}_${ts}.${ext}` from client-supplied `scriptId`, `ext`
  with no ownership check and no `ext` sanitisation.
- `src/app/api/clips/[clipId]/attempts/upload-url/route.ts:19-25` — same, keyed on `clipId`.
- **Correct patterns to reuse:**
  - Ownership: `src/app/api/scenes/[sceneId]/download/route.ts:36` (`.eq('requested_by', user.id)`).
  - Extension sanitisation: `src/app/api/auditions/takes/[takeId]/clips/route.ts:67-69`
    (`sanitizeStorageFilename`, `inferExtension` from content-type).
- `src/app/api/rooms/route.ts:22-45` — room-code generation exits the collision loop with a
  collided code on exhaustion, producing a generic 500 (F-21; not data corruption — DB unique
  constraint holds).

## 3. Proposed changes

### 3.1 Ownership / access validation before issuing a URL
Both upload-URL routes: verify the authenticated user may write to the referenced
`scriptId`/`clipId` (owns it or has an appropriate relationship) before returning a presigned
URL. Reuse the ownership predicate style from `scenes/[sceneId]/download`.

### 3.2 Constrain extension and content-type
Derive the extension from a validated content-type via `inferExtension` and pass the client
value through `sanitizeStorageFilename` (reuse `auditions/takes/.../clips`). Reject anything
not in an explicit media whitelist so the storage key can't carry an arbitrary extension.

### 3.3 Enforce a size ceiling
Set a max object size on the presigned URL (content-length range) appropriate to recordings/
clip attempts, so a URL can't be used for unbounded uploads.

### 3.4 Clean room-code exhaustion (small adjacent fix, F-21)
After the collision loop exhausts its attempts, return an explicit 503 "unable to generate
room code" instead of attempting the insert with a collided code.

## 4. Rationale
Presigned URLs are capability tokens; issuing them without ownership, type, and size
constraints turns them into an arbitrary-write/DoS primitive. The safe patterns already exist
in the codebase — this PRD generalises them so all upload paths are consistent.

## 5. Phases
1. Ownership validation (§3.1) + extension/content-type constraint (§3.2) — the security core.
2. Size ceiling (§3.3).
3. Room-code exhaustion handling (§3.4).

## 6. Risks / dependencies
- Ownership rules must match how recordings/clip-attempts are legitimately created (verify the
  happy path still succeeds for the resource owner).
- No schema change required.

## 7. Verification
- Request an upload URL for a resource the user does not own → rejected.
- Request with a disallowed `ext` / mismatched content-type → rejected or normalised.
- Upload exceeding the size ceiling → rejected by R2.
- Simulate room-code exhaustion → clean 503, no collided insert.

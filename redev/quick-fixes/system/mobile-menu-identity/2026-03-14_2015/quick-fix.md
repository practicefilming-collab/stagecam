# Quick Fix: Mobile Menu Identity Row

## Intake

- Dropped image: `IMG_7988.jpg`
- Dropped note: `68d4b423-2389-4af9-9ce5-51609937884d.txt`

Original request:

> can this section be simplified to just be the same as it’s displayed in the call list with the appropriate logo

## Observed Issue

The mobile menu account row currently renders as plain text:

- first line: display name
- second line: `Google login - Instagram @Mr_Ridley`

This is visually busier and less consistent than the cast list/call sheet identity treatment, which uses a compact icon-plus-identity presentation.

The current menu implementation in `src/components/layout/header.tsx` uses:

- `getProfileDisplayName(profile)`
- `getProfileIdentityLine(profile)`

The stage page already contains platform-aware icon rendering logic in `src/app/(protected)/stage/[roomCode]/page.tsx`.

## Proposed Quick Fix

Replace the mobile menu’s secondary identity text line with the same identity style used in the cast/call-sheet context:

- show the public display name
- show the appropriate platform logo
- show the concise platform identity label instead of the verbose `Google login - ...` sentence

Target outcome:

- menu identity row matches the app’s public identity presentation
- less noise in the mobile nav
- no change to auth/account behavior

## Confidence

High.

This appears to be a contained UI consistency fix in a single shared component. The behavior change is presentation-only and does not require schema, API, routing, or auth-flow changes.

## Critical Analysis

Reasons not to implement:

1. The current line exposes both login provider and public identity, which may be useful debugging context.
2. The icon treatment currently exists in the stage page rather than a shared helper, so copying it directly into the header would create duplication.
3. Because the header is global, the visual change will affect every authenticated page, not just the stage screen shown in the screenshot.

Why those reasons do not block the fix:

1. The menu row is user-facing identity UI, not an admin/debug surface. The verbose login-provider sentence is not the right default presentation here.
2. The implementation should reuse or extract shared identity presentation logic instead of duplicating SVG/icon code. That is still a small refactor, not a PRD-sized change.
3. The cross-app impact is exactly why the change belongs in the shared header. The scope is still small and easy to verify manually.

## Decision

`approved for direct implementation`

This qualifies as a genuine quick fix. It should proceed as a small shared-header UI adjustment, with a preference for reusing or extracting the existing platform identity presentation instead of creating a second bespoke rendering path.

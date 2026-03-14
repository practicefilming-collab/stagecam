# PRD: "Continue Recording" — Expandable Scene List + Auto-Room Creation

**Author**: conversation session 2026-03-14
**Status**: Draft

---

## 1. Background

The "Continue recording →" link on each character card in `/stats/me` currently navigates to `/stats/[slug]`, a read-only analytics page with no recording capability. The link is misleading — users expect it to help them continue recording unfinished lines.

This PRD replaces the dead-end link with an expandable scene list that shows exactly which scenes still need recording, and a one-tap flow that creates a solo room, pre-selects the script+scene, auto-claims the character, and drops the user directly into rehearsal.

---

## 2. Problem

1. **Misleading CTA**: "Continue recording →" goes to a stats page, not a recording flow
2. **High friction to resume**: Users must manually create a room, pick the script, find the right scene, claim the character, and start — 5+ taps for something that should be 1
3. **No visibility into remaining work**: Users can see per-act completion percentages but not which specific scenes still need recording

---

## 3. Solution

### 3.1 Expandable Scene List on Character Cards

Replace the `<Link>` on incomplete character cards with a toggle button that expands to show unrecorded scenes inline. Each scene row shows act/scene number, heading, and remaining line count.

### 3.2 One-Tap Room Creation

Tapping a scene row creates a solo room via `POST /api/rooms` with the script and scene pre-selected, then navigates to the backstage page with `?character=X&autoStart=1` query params.

### 3.3 Auto-Advance Backstage

The backstage page reads URL search params and auto-advances through the entire flow:
1. Scene confirmation → generates call sheet
2. Character claim → claims the specified role (works for multi-character scenes)
3. Mark ready
4. Start session (solo)

The user lands directly in the rehearse view with zero manual steps.

---

## 4. Implementation

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/stats/me/unrecorded/route.ts` | **Create** | New endpoint returning unrecorded scenes per character per script |
| `src/components/stats/role-call.tsx` | **Edit** | Expandable scene list UI, fetch logic, room creation |
| `src/app/(protected)/stage/[roomCode]/page.tsx` | **Edit** | Read search params, auto-advance through confirmScene → claimRole → markReady → startSession |

### New API: `GET /api/stats/me/unrecorded`

**Query params:** `?scriptId=UUID&character=CHARACTER_NAME`

**Logic:**
1. Get all dialogue chunks for this character in this script (join chunks → scenes → acts)
2. Get all recordings by this user for those chunk IDs
3. Group by scene, compute `totalLines - recordedLines = remainingLines`
4. Return only scenes with `remaining > 0`, sorted by act_number, scene_number

**Response:**
```json
{
  "scenes": [
    {
      "sceneId": "uuid",
      "sceneNumber": 3,
      "sceneHeading": "INT. APARTMENT - NIGHT",
      "actNumber": 1,
      "totalLines": 8,
      "recordedLines": 2,
      "remainingLines": 6
    }
  ]
}
```

### RoleCall Component Changes

- `<Link>` → `<button>` with toggle expansion
- State: `expandedKey`, `unrecordedScenes`, `loadingUnrecorded`, `creatingRoom`
- Loading spinner while fetching
- Scene rows: act/scene number, heading, remaining count
- Tap handler: `POST /api/rooms` → `router.push(/stage/${code}?character=X&autoStart=1)`
- Edge case: empty list → "All scenes recorded!"

### Backstage Auto-Advance

Chain of ref-guarded effects that each fire exactly once:
1. `loadRoom()` detects `selected_scene_id` + `?character` → sets scene selection state
2. Effect: `selectedSceneId` set → calls `confirmScene()`
3. Effect: `preview` loaded → calls `claimRole(character)`
4. Effect: role claimed → calls `markReady()`
5. Effect: ready + solo creator → calls `startSession()`

Key: uses separate refs (`autoConfirmFiredRef`, `autoClaimFiredRef`, `autoStartFiredRef`, `autoSessionFiredRef`) to prevent re-firing on state changes.

---

## 5. Edge Cases

| Case | Behavior |
|------|----------|
| All scenes recorded for character | Shows "All scenes recorded!" message |
| Character exists in multi-character scene | Auto-claim targets specific character by name, not sole-character shortcut |
| Room creation fails | Button re-enables, no navigation |
| User has 100% completion | "Continue recording" button not shown at all (existing behavior) |

---

## 6. Verification

1. `/stats/me` → tap "Continue recording" on a character card → scene list loads with correct remaining counts
2. Tap a scene → room created → lands on backstage → auto-advances to rehearsal
3. Works for characters in multi-character scenes
4. Character with all scenes recorded shows "All scenes recorded!"
5. Build passes (`npm run build`)

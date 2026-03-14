# PRD: /stage/[roomCode] Backstage Redesign

**Author**: redev session 2026-03-09
**Snapshot**: `photo_2026-03-09_21-23-34.jpg`
**Status**: Draft

---

## 1. Background

The `/stage/[roomCode]` page is the pre-rehearsal lobby — the most complex page in StageCam. It manages a 3-stage creator flow (script → scene → callsheet), real-time presence, mode selection (auto/pick), call sheet preview, and ready-check mechanics.

A critical analysis identified 8 UI elements for review. A live debate resolved each element with a verdict. Two items marked "investigate" (Candidate Scenes and Avg Coverage stats) were resolved via matchmaking code research. All decisions are now finalised.

**Research chain**:
- [`critical-analysis.md`](./critical-analysis.md) — screenshot review, 8 elements critiqued
- [`debate-on-critical-analysis.md`](./debate-on-critical-analysis.md) — verdicts per element
- [`investigations-on-debate.md`](./investigations-on-debate.md) — resolved Candidate Scenes & Avg Coverage; concluded auto mode should show the pick, not the pool

---

## 2. Current Implementation

### Source Files

| File | Role |
|------|------|
| `src/app/(protected)/stage/[roomCode]/page.tsx` | Main page component (~742 lines, client) |
| `src/app/api/rooms/[roomId]/preview/route.ts` | Preview/stats API (auto stats + pick call sheet) |
| `src/app/api/rooms/[roomId]/start/route.ts` | Start rehearsal API |
| `src/app/api/rooms/[roomId]/route.ts` | Room PATCH API |
| `src/lib/matchmaking/index.ts` | `getAutoPreviewStats()` + `runMatchmaking()` |
| `src/lib/matchmaking/coverage.ts` | Coverage calculations |
| `src/hooks/use-presence.ts` | Real-time presence hook |

### Current Flow

1. **Creator** opens room → sees "Waiting Room" header + room code + cast list
2. **Stage 1 (script)**: Creator picks a script from a list
3. **Stage 2 (scene)**: Creator chooses auto or pick mode, then confirms
4. **Stage 3 (callsheet)**: Preview appears — pick mode shows a full call sheet with character assignments, auto mode shows a 2×2 stat grid (Participants, Candidate Scenes, Avg Coverage, Chunks/Person)
5. **Ready check**: All users tap "Mark as Ready" (one-way, no undo)
6. **Start**: Creator taps "Start Rehearsal" — matchmaking runs server-side, redirects to `/stage/[roomCode]/rehearse`

**Non-creators** see "Waiting for the director..." messages at each stage. At callsheet stage they see a read-only call sheet (pick) or stripped-down stats (auto).

### Current Auto Preview API Response

```ts
// GET /api/rooms/[roomId]/preview (auto mode, no scene selected)
{
  mode: 'auto';
  candidateScenes: number;      // raw scenes.length — to be removed
  averageCoverage: number;      // corpus-wide ratio — to be removed
  participantCount: number;
  estimatedChunksPerPerson: number;
}
```

### Current `room_participants` Table

```sql
create table room_participants (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(id),
  joined_at timestamptz not null default now(),
  assigned_chunks jsonb default '[]',
  is_creator boolean not null default false,
  unique (room_id, user_id)
);
```

---

## 3. Element Redesigns

### 3.1 Page Title: "Waiting Room" → "Backstage"

**Problem**: "Waiting Room" is generic and frames the page as a passive lobby. This is the most complex page in the app — it undersells itself.

**Requirement**: Rename to "Backstage". More theatrical, fits the app's language, better represents the preparation that happens here.

**Spec**:
- `page.tsx` line 304: Change `"Waiting Room"` → `"Backstage"`
- Function name `WaitingRoomPage` (line 41) can optionally be renamed to `BackstagePage` for consistency

**Implementation**: Single string change + optional function rename.

---

### 3.2 Cast "(you)" Label

**Problem**: Users see their own name in the cast list with no self-identification. In a 5-person room, it takes a moment to locate yourself. There's no "(you)" label, no different styling.

**Requirement**: Display "(you)" next to the current user's participant entry in the Cast section.

**Spec**:
- Obtain the current user's ID (already available via `supabase.auth.getUser()` elsewhere in the component; hoist to a shared state or fetch once on mount)
- In the participants map (`page.tsx` lines 326–334), compare `p.userId` to the current user's ID
- When matched, append `(you)` in muted text after the display name:
  ```tsx
  <span>{p.displayName}</span>
  {p.userId === currentUserId && (
    <span className="text-muted text-xs ml-1">(you)</span>
  )}
  ```

**Implementation**: Add a `currentUserId` state (fetched on mount), update the participant render loop. ~10 lines changed.

---

### 3.3 Auto Mode: Show the Pick, Not the Pool

**Problem**: Auto mode currently shows pool-level stats (110 Candidate Scenes, 3% Avg Coverage) that are backend details surfaced where they create confusion. Users don't need to know how many scenes were considered — they need to know which scene was picked.

**Root cause** (from investigation): `candidateScenes` is just `scenes.length` — a raw count. `averageCoverage` is a corpus-wide ratio across all scenes in the script. Neither helps users prepare for the upcoming rehearsal.

**Requirement**: When the creator confirms auto mode, the system picks the best scene immediately and displays it by name. Remove Candidate Scenes and Avg Coverage stats entirely.

**Spec**:

#### 3.3.1 Matchmaking: run scene selection at confirm time

Currently, auto mode preview calls `getAutoPreviewStats()` which returns pool stats without selecting a scene. Change this:

- When `selection_mode === 'auto'` and no `selected_scene_id`, the preview API should run `runMatchmaking()` instead of `getAutoPreviewStats()`
- This triggers scene selection + character assignment + chunk distribution — the same as pick mode
- The response becomes a `PickPreviewData`-shaped object (scene name, act, call sheet, etc.)
- `getAutoPreviewStats()` becomes unused and can be removed from `matchmaking/index.ts` (lines 141–192)

#### 3.3.2 Frontend: display the selected scene

Replace the 2×2 stat grid (`page.tsx` lines 568–585) with the same call sheet display used for pick mode. The `AutoPreviewData` interface (lines 29–35) is no longer needed — auto mode now returns `PickPreviewData`.

#### 3.3.3 Stats to keep

After the scene is selected, show these stats about the **selected scene** (not the pool):
- **Participants**: keep (already in call sheet)
- **Chunks / Person**: keep (derivable from call sheet entries)
- **Scene name**: new — displayed as the call sheet header (e.g., "Act 1 · Scene 14 — INT. ANDY'S ROOM")

#### 3.3.4 Stats to remove

- **Candidate Scenes**: remove from API response and frontend
- **Avg Coverage**: remove from API response and frontend

#### 3.3.5 Non-creator auto view

Non-creators (`page.tsx` lines 682–698) currently see `candidateScenes` and `averageCoverage` in a stripped-down summary. After this change, they see the same call sheet as pick mode — identical to what the creator sees.

**Implementation**: Modify `preview/route.ts` to always run `runMatchmaking()`. Remove `getAutoPreviewStats()`. Unify auto and pick frontend rendering. Remove `AutoPreviewData` interface.

---

### 3.4 "Change Mode" → "Change Scene"

**Problem**: "Change Mode" (`page.tsx` line 564) is cryptic. Users don't know what "mode" refers to. After auto mode picks a scene, the user might want to change the scene — "Change Scene" is self-explanatory.

**Requirement**: Rename the link text.

**Spec**:
- `page.tsx` line 564: Change `"Change Mode"` → `"Change Scene"`
- Behaviour stays the same: clicking returns to the scene selection stage

**Implementation**: Single string change.

---

### 3.5 Role Drafting Flow

**Problem**: Currently, roles are auto-assigned when rehearsal starts. Users tap "Mark as Ready" without knowing what character they'll play. Readiness is premature and meaningless. Non-hosts have nothing to do during the callsheet stage.

**Requirement**: Users actively draft their roles before readying up. This is the largest new feature in this redesign.

#### 3.5.1 Full Flow (8 steps)

1. **Scene confirmed** → All users (creator and non-creator) see the call sheet with available roles listed by part size (most dialogue lines first, then narrator)
2. **User taps "Select Role"** → A role selection UI appears showing all available (unclaimed) characters with their line counts
3. **User picks a character** → The role is claimed. It is removed from the available pool for all other users in real-time
4. **User can pick additional characters** → If roles remain unclaimed, the user can select more. Each selection removes from pool immediately
5. **At least 1 role selected** → The "Mark as Ready" button appears in the action area
6. **User taps "Mark as Ready"** → Returns to the Backstage view with their ready state shown (green dot in Cast, "Ready" label on their call sheet entry)
7. **User can unready** → Tapping "Unready" releases all their claimed roles back to the pool. The user must go through role selection again. Their previous roles may have been taken by others in the meantime
8. **Narration** → System chunks (action lines, scene headings, transitions) are distributed among: (a) users who have no character role, or (b) users who opted in to narrate alongside their character role

#### 3.5.2 UI States

**State A: Role Selection Available** (after scene is confirmed, before selecting a role)
```
┌────────────────────────────────────────┐
│  AVAILABLE ROLES                       │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ WOODY              87 lines     │  │  ← tappable
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ BUZZ LIGHTYEAR     64 lines     │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ANDY               23 lines     │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ + Narrator         12 lines     │  │  ← narration opt-in
│  └──────────────────────────────────┘  │
│                                        │
│  [Select Role]                         │  ← primary action
└────────────────────────────────────────┘
```

**State B: Role Selected** (user has picked at least one role)
```
┌────────────────────────────────────────┐
│  YOUR ROLES                            │
│                                        │
│  WOODY (87 lines)               [×]   │  ← removable before ready
│                                        │
│  REMAINING ROLES                       │
│  BUZZ LIGHTYEAR     64 lines    [+]   │  ← add more
│  ANDY               23 lines    [+]   │
│                                        │
│  [Mark as Ready]                       │  ← appears now
└────────────────────────────────────────┘
```

**State C: Ready** (user has marked ready)
```
┌────────────────────────────────────────┐
│  YOUR ROLES                            │
│                                        │
│  WOODY (87 lines)          ✓ Ready     │
│                                        │
│  [Unready]                             │  ← releases roles
└────────────────────────────────────────┘
```

#### 3.5.3 Real-Time Behaviour

- **Role claims broadcast** via Supabase Realtime (new broadcast event `role_claim` on the existing `room-status:{roomCode}` channel)
- **Payload**: `{ userId, displayName, characterName, action: 'claim' | 'release' }`
- All participants maintain a local map of `characterName → userId` to show who claimed what
- When a role is claimed by someone else, it is removed from the "REMAINING ROLES" list immediately
- When a user unreadies and releases roles, those roles reappear in other users' available lists

#### 3.5.4 DB / API Changes

**Option A (recommended): Broadcast-only, no DB persistence for draft state**

Role selections during the draft phase are ephemeral — stored only in client-side state and synchronised via Supabase Realtime broadcasts. Rationale:
- Draft state is short-lived (minutes at most)
- The final role assignments are already persisted when rehearsal starts (via `assigned_chunks` in `room_participants`)
- Adding columns to `room_participants` for draft state creates sync complexity with no lasting benefit

The only new state needed is a broadcast channel event. No schema migration required.

**On rehearsal start**: The `/api/rooms/[roomId]/start` endpoint receives the role draft results (character-to-user mappings) as part of the request body. It passes these mappings into `runMatchmaking()` so that the distributor respects user-selected roles instead of auto-assigning.

**New request body for `POST /api/rooms/[roomId]/start`**:
```ts
{
  roleDraft?: {
    [userId: string]: string[];  // userId → array of character names claimed
  }
}
```

If `roleDraft` is provided, `assignCharacters()` in `character-assigner.ts` uses these assignments instead of its own algorithm. Unclaimed characters are distributed to remaining participants.

#### 3.5.5 Narration Rules

- **Narration** = system chunks that are `is_system = false` but have no character (action lines, transitions, scene headings that aren't flagged as system)
- Wait — per CLAUDE.md: system chunks (`is_system = true`) are always TTS and never assigned to users. Narration here refers to non-dialogue, non-system chunks (action lines with `is_system = false` and `type !== 'dialogue'`).
- **Default distribution**: Split evenly among users who have no character role
- **Opt-in**: Users with a character role can also opt into narration by selecting "+ Narrator" in the role list
- **If everyone has a character**: Narration chunks are split evenly among all users (everyone narrates)
- **Chunk distributor** (`chunk-distributor.ts`) already handles non-dialogue distribution — the only change is to accept an optional list of "narration-opted-in" user IDs

#### 3.5.6 Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| All roles taken, new user joins | User sees no available character roles. They can opt into Narrator only. "Mark as Ready" appears with narrator-only assignment. |
| Last person joins late | They see remaining unclaimed roles. If none remain, narrator-only path. |
| Host starts with unclaimed roles | Unclaimed characters are auto-distributed among participants (same as current behaviour). Warning text: "N roles unclaimed — will be auto-assigned." |
| User closes browser mid-draft | Presence leave event detected. Their claimed roles are released back to the pool after a short timeout (e.g., 10 seconds). Other users see roles reappear. |
| Solo user | They see all roles available. Can claim as many as they want. All unclaimed roles will be auto-assigned to them on start. |

---

### 3.6 "Leave Room" Button

**Problem**: No visible way to exit the room. Non-hosts especially have no "Leave Room" option — they rely on browser back, which doesn't clean up their participant record.

**Requirement**: Add a "Leave Room" button visible to all users.

**Spec**:
- Position: Below the main action buttons, at the bottom of the page content
- Style: Subtle, muted — not competing with primary actions
  ```tsx
  <button
    onClick={leaveRoom}
    className="w-full py-2 text-sm text-muted hover:text-red-400 transition-colors mt-6"
  >
    Leave Room
  </button>
  ```
- **Behaviour**:
  1. Remove the user's `room_participants` row (or mark as left)
  2. Untrack from the Supabase Realtime presence channel
  3. If the user had claimed roles, release them (broadcast `role_claim` with `action: 'release'`)
  4. Navigate to `/menu`
- **Creator leaving**: If the creator leaves, the room is effectively abandoned. Show a confirmation dialog for creators only: "You're the director. Leaving will end the session for everyone. Leave anyway?"
- **API**: `DELETE /api/rooms/[roomId]/participants/[userId]` — or reuse the existing room PATCH to handle participant removal

**Implementation**: New `leaveRoom` handler in `page.tsx`, optional new API endpoint, confirmation dialog for creators.

---

## 4. API Changes Summary

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/rooms/[roomId]/preview` | Auto mode now runs `runMatchmaking()` instead of `getAutoPreviewStats()`. Returns `PickPreviewData` shape for both modes. `AutoPreviewData` response shape is retired. |
| `POST /api/rooms/[roomId]/start` | Accepts optional `roleDraft` body with character-to-user mappings from the draft phase. Passes to matchmaking. |

### Removed Code

| Item | Location |
|------|----------|
| `getAutoPreviewStats()` | `src/lib/matchmaking/index.ts` lines 141–192 — no longer called |
| `AutoPreviewData` interface | `page.tsx` lines 29–35 — replaced by unified `PickPreviewData` |

### New Endpoints (optional)

| Endpoint | Purpose |
|----------|---------|
| `DELETE /api/rooms/[roomId]/participants/[userId]` | Clean participant removal for "Leave Room". Could alternatively be handled via Supabase client-side delete with RLS. |

### New Broadcast Events

| Event | Channel | Payload |
|-------|---------|---------|
| `role_claim` | `room-status:{roomCode}` | `{ userId: string, displayName: string, characterName: string, action: 'claim' \| 'release' }` |

---

## 5. Frontend Changes Summary

### `page.tsx`

| Change | Lines Affected | Description |
|--------|---------------|-------------|
| Rename title | 304 | `"Waiting Room"` → `"Backstage"` |
| Add `currentUserId` state | New | Fetch once on mount, used for "(you)" label |
| Cast "(you)" label | 326–334 | Compare `p.userId` to `currentUserId`, render "(you)" |
| Remove `AutoPreviewData` interface | 29–35 | No longer needed — auto returns `PickPreviewData` |
| Unify callsheet rendering | 555–606, 682–698 | Auto mode renders same call sheet as pick mode |
| Rename "Change Mode" | 564 | → `"Change Scene"` |
| Role drafting UI | New section | Role list, claim/release, ready/unready flow |
| "Leave Room" button | New | Below action buttons, all users |
| Remove auto stat grid | 568–585 | Replaced by unified call sheet |
| Remove non-creator auto stats | 682–698 | Replaced by unified call sheet |

### `src/lib/matchmaking/index.ts`

| Change | Lines Affected | Description |
|--------|---------------|-------------|
| Remove `getAutoPreviewStats()` | 141–192 | No longer used |
| Accept role draft in `runMatchmaking()` | Context type | New optional `roleDraft` field in `MatchmakingContext` |

### `src/lib/matchmaking/character-assigner.ts`

| Change | Description |
|--------|-------------|
| Accept pre-assigned roles | When `roleDraft` is provided, use those mappings first, then auto-assign remaining |

### `src/app/api/rooms/[roomId]/preview/route.ts`

| Change | Lines Affected | Description |
|--------|---------------|-------------|
| Always run `runMatchmaking()` | 46–54 | Remove the `getAutoPreviewStats()` branch |

### `src/app/api/rooms/[roomId]/start/route.ts`

| Change | Description |
|--------|-------------|
| Accept `roleDraft` body | Parse and pass character-to-user mappings to matchmaking |

---

## 6. Visual Spec

All elements follow existing conventions: gold (#d4af37), bg (#0a0a0a), `bg-surface`, `border-border`, `text-muted`. No new colours introduced.

### Redesigned Page Layout — Backstage (callsheet stage, role draft in progress)

```
┌──────────────────────────────────────┐
│  StageCam                        ☰   │  ← Header (unchanged)
├──────────────────────────────────────┤
│                                      │
│  Backstage                           │  ← renamed from "Waiting Room"
│  X X A 7 6 C                        │  ← room code (unchanged)
│  Click to copy                       │
│  Toy Story (1995)                    │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ CAST (3)                       │  │
│  │                                │  │
│  │  ● Incognito (you)             │  │  ← "(you)" label
│  │  ● Alice                       │  │
│  │  ○ Bob                    Ready│  │  ← green dot = ready
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ CALL SHEET              Change │  │  ← "Change Scene" link
│  │                          Scene │  │
│  │                                │  │
│  │ Act 1 · Scene 14               │  │  ← auto-selected scene
│  │ INT. ANDY'S ROOM               │  │
│  │ 47 rehearsable chunks          │  │
│  │                                │  │
│  │ ── YOUR ROLES ──────────────── │  │
│  │                                │  │
│  │ WOODY (87 lines)          [×]  │  │  ← claimed role
│  │                                │  │
│  │ ── REMAINING ROLES ─────────── │  │
│  │                                │  │
│  │ BUZZ LIGHTYEAR  64 lines  [+]  │  │
│  │ ANDY            23 lines  [+]  │  │
│  │ + Narrator      12 lines  [+]  │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Mark as Ready]                     │  ← appears after ≥1 role
│                                      │
│  [Start Rehearsal (1/3 ready)]       │  ← creator only
│                                      │
│  Leave Room                          │  ← muted, bottom
│                                      │
└──────────────────────────────────────┘
```

### Backstage — Ready State (user has readied up)

```
┌──────────────────────────────────────┐
│  ...header, room code, cast...       │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ CALL SHEET              Change │  │
│  │                          Scene │  │
│  │                                │  │
│  │ Act 1 · Scene 14               │  │
│  │ INT. ANDY'S ROOM               │  │
│  │                                │  │
│  │ ── YOUR ROLES ──────────────── │  │
│  │                                │  │
│  │ WOODY (87 lines)      ✓ Ready │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  [✓ Ready!]                          │  ← green, shows ready state
│  [Unready]                           │  ← releases roles
│                                      │
│  [Start Rehearsal (2/3 ready)]       │  ← creator only
│                                      │
│  Leave Room                          │
│                                      │
└──────────────────────────────────────┘
```

---

## 7. Implementation Order

Ordered by dependency and risk:

| Phase | Scope | Files | Risk |
|-------|-------|-------|------|
| 1 | Rename "Waiting Room" → "Backstage", rename "Change Mode" → "Change Scene" | `page.tsx` | Low — two string changes |
| 2 | Add "(you)" label to Cast | `page.tsx` | Low — add `currentUserId` state + render logic |
| 3 | Auto mode picks scene immediately (unify auto/pick preview) | `preview/route.ts`, `matchmaking/index.ts`, `page.tsx` | Medium — removes `getAutoPreviewStats()`, changes auto preview response shape, unifies frontend rendering |
| 4 | Role drafting flow — UI + real-time broadcasts | `page.tsx` | High — largest new feature, new UI states, broadcast events, role claim/release logic |
| 5 | Role drafting flow — backend integration (pass `roleDraft` to matchmaking) | `start/route.ts`, `matchmaking/index.ts`, `character-assigner.ts` | Medium — modifies matchmaking input, must handle partial drafts + unclaimed roles |
| 6 | "Leave Room" button + cleanup | `page.tsx`, optional new API endpoint | Low — navigation + optional participant removal |

**Phases 1–2** are safe to ship independently. **Phase 3** is a prerequisite for Phase 4 (role drafting needs a selected scene to list roles from). **Phases 4–5** are the core feature and should be developed together. **Phase 6** is independent.

---

## 8. Out of Scope

Items explicitly deferred during the debate process:

| Item | Source | Reason for deferral |
|------|--------|---------------------|
| Script name placement redesign | Debate Point 2 | Only one script currently; revisit when multi-script exists |
| Dot legend for Cast status indicators | Debate Point 3 | Learnable without legend; revisit when larger groups tested |
| "Chunks" terminology rename | Debate Point 4 | Cross-cutting site-wide decision, too big for one page's redesign |
| Non-host live view of host's script/scene selection | Debate Point 7 | Script selection flow must stabilise first |
| Sticky footer for action buttons | Debate Point 8 | Address when scroll-off becomes a visible issue with real group sizes |
| Step progress indicator (Step 1 of 3) | Debate Point 8 | Not critical enough to add now |
| Start Rehearsal confirmation dialog | Debate Point 6 | Role drafting flow provides natural "are you sure?" moment |
| Button hierarchy (Ready vs Start visual weight) | Debate Point 6 | Fine as-is after role draft restructures the flow |

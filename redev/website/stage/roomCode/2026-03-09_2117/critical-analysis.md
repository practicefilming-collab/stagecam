# /stage/[roomCode] — Critical Analysis

**Snapshot**: `photo_2026-03-09_21-23-34.jpg`
**Date**: 2026-03-09 21:17
**State captured**: Auto mode, callsheet stage, 1 participant, not yet ready

---

## Element Critiques

### 1. Header Bar

- "StageCam" branding (gold italic) left, hamburger menu right, dark bar.
- **Critique**: Same as every page. No issues. Consistent, clean, on-brand.

### 2. Room Code Header — "Waiting Room / X X A 7 6 C"

- Gold "Waiting Room" title centered, room code in large mono tracking, "Click to copy" hint, script name below.
- **Critique**:
  - **The room code works well**: Large, legible, spaced tracking makes it easy to read aloud to someone across a room. The copy-to-clipboard tap is discoverable. Good.
  - **"Waiting Room" is generic**: This title tells me nothing about what happens here. It's the most complex page in the app (3-stage creator flow, real-time presence, mode selection, call sheet preview) and the title undersells it as a passive lobby. "Backstage" or "Green Room" would be more theatrical and equally descriptive.
  - **Script name placement is awkward**: "Toy Story (1995)" sits below the code, disconnected from the flow. Since the script is the anchor for everything below, it should feel more prominent — or better yet, integrated into the stage context.

### 3. Cast Section

- Shows "CAST (1)" with a single "Incognito" participant and a gold dot.
- **Critique**:
  - **The gold dot is ambiguous**: Is it "online"? "Not ready"? There's also a green dot state for "ready" (visible in code) but no legend or explanation. A first-time user won't know what colors mean.
  - **"Incognito" is unhelpful**: This is presumably the user's display name, but seeing your own name listed as a third-party participant is disorienting. There's no "you" indicator — no "(you)" label, no different styling, no self-identification.
  - **Solo use feels hollow**: With 1 participant, the Cast section takes up space to tell me something I already know (I'm here). The section is designed for groups but doesn't adapt to solo use — no messaging like "Share the room code to invite others" or a share button.
  - **Cast header uses "Cast"**: Good theatrical language. Consistent with the app's theme.

### 4. Auto-Match Summary

- 2x2 grid of stat cards: 1 Participant, 110 Candidate Scenes, 3% Avg Coverage, ~9 Chunks / Person. "Roles assigned when rehearsal starts" footer. "Change Mode" link top-right.
- **Critique**:
  - **"110 Candidate Scenes" is overwhelming and unexplained**: A user seeing 110 doesn't know what this means. Are we doing all 110? Is the system picking 1? What makes a scene a "candidate"? The number creates anxiety without context. Something like "110 scenes eligible — system picks the best fit" would help.
  - **"3% Avg Coverage" is discouraging**: Seeing 3% as a hero number feels like failure. The framing should be inverted — "97% new material" or "mostly unexplored scenes" would make the same data feel like opportunity rather than inadequacy.
  - **"~9 Chunks / Person" is developer jargon**: Users don't think in chunks. "~9 lines to record" or "~5 min estimated" would be more relatable. The tilde is also unusual for a non-technical audience.
  - **"Roles assigned when rehearsal starts"**: Good — sets expectations. But it's buried as tiny muted text. This is actually the most important piece of information on the card (answering "what character will I play?") and should be more prominent.
  - **"Change Mode" link is cryptic**: Change to what? The user already chose auto. "Change Mode" doesn't explain that there's a "Pick" alternative where you manually select a scene. Should say "Switch to manual pick" or show the toggle from the scene selection stage.
  - **No summary of what auto mode will do**: The card shows stats but doesn't explain the process. "The system will pick the best scene for your group and assign roles automatically" would orient a new user.

### 5. Mark as Ready Button

- Full-width gold-bordered button with "Mark as Ready" text. Turns green when clicked.
- **Critique**:
  - **Good pattern**: Clear action, obvious state change, standard ready-check mechanic.
  - **No unready mechanism**: Once you tap "Mark as Ready" it's permanent for the session. What if you tapped by accident? What if you want to re-read the summary? There's no toggle-back. The button disables permanently.
  - **Ready state is invisible to self after marking**: The button changes to "Ready!" but the green dot in the Cast section (which shows others your status) requires you to scroll up to verify. The ready confirmation could be more celebratory or reassuring.

### 6. Start Rehearsal Button

- Full-width gold-filled button: "Start Rehearsal (0/1 ready)". Creator-only.
- **Critique**:
  - **The (0/1 ready) counter is excellent**: Clear, real-time, tells the director exactly who's holding things up.
  - **No enforcement of readiness**: The button is always enabled. A director can start with 0/5 ready. This may be intentional (director override) but there's no confirmation dialog — one accidental tap starts the session for everyone. High-risk single-tap action with no undo.
  - **Button hierarchy is confusing**: "Mark as Ready" and "Start Rehearsal" are the same width, similar visual weight. For the creator, "Start Rehearsal" is the primary action, but "Mark as Ready" appears first and looks equally important. The creator has to ready themselves AND start — but there's no indication of this two-step requirement.
  - **No loading/progress feedback**: After tapping "Start Rehearsal", the matchmaking runs server-side. The button shows "Starting..." but there's no progress bar, no indication of what's happening, no estimated time. For a 110-scene auto-match, this could take seconds — seconds of uncertainty.

### 7. Page Structure — Creator vs Non-Creator

- The page has a massive `{isCreator ? (...) : (...)}` branch with duplicated call sheet rendering.
- **Critique** (code-level, not visible to user):
  - **~400 lines of duplication**: The pick-mode call sheet is rendered identically for creator and non-creator, with the only difference being that creators see "Change Scene" and "Start Rehearsal". This duplication means every call sheet design change must be made in two places.
  - **Non-creator experience is passive and anxious**: Non-creators see "Waiting for the director to select a script...", "The director is selecting a scene...", "Waiting for the director to start the session...". Three consecutive stages of waiting with no agency. No information about what the director is doing, no progress indicator, no estimated time. On a phone in a classroom, this feels like being left on hold.
  - **No way for non-creators to see what's being considered**: In auto mode, the non-creator sees a stripped-down summary with less info than the creator. Why? They could benefit from seeing the same 4-stat card to understand what they're about to rehearse.

### 8. Overall Page — Mobile Usability

- **Critique**:
  - **Too much vertical scrolling**: Room code header + cast + auto-match summary + two buttons = a lot of content. On the screenshot (iPhone, 5G), the full page is visible but only because there's 1 participant and auto mode has a compact summary. In pick mode with 10 scenes listed, or with 5 cast members, the buttons would be pushed below the fold.
  - **No sticky footer for action buttons**: The "Mark as Ready" and "Start Rehearsal" buttons should be anchored to the bottom of the viewport, not buried below scrollable content. Missing the start button because it's scrolled off is a real failure mode in a group setting.
  - **No visual progress indicator**: The creator goes through 3 stages (script → scene → callsheet) but there's no breadcrumb, no step indicator, no progress bar. You have to infer where you are from what's on screen. A simple "Step 2 of 3" would orient everyone.
  - **No back navigation**: No visible way to go back to the menu/home. The browser back button works, but the page doesn't communicate "you can leave." For non-creators especially, there's no "Leave Room" option.

---

## Ranking: Least Criticized → Most Criticized

| Rank | Element | Severity | Summary |
|------|---------|----------|---------|
| 1 (least) | **Header Bar** | None | No issues. Standard, consistent. |
| 2 | **Mark as Ready Button** | Minor | Works well, but no undo/toggle-back mechanism. |
| 3 | **Room Code Header** | Minor | Code display is good, but "Waiting Room" title is generic and script placement is disconnected. |
| 4 | **Cast Section** | Moderate | Ambiguous status dots, no self-identification, empty when solo. |
| 5 | **Start Rehearsal Button** | Moderate | Good ready counter, but no confirmation dialog, confusing button hierarchy, no progress feedback. |
| 6 | **Auto-Match Summary** | Significant | Overwhelming/unexplained numbers, jargon ("chunks"), discouraging framing (3%), buried key info. |
| 7 | **Page Structure (creator/non-creator)** | Significant | Massive code duplication, passive non-creator experience, no progress indicators, no sticky action buttons. |
| 8 (most) | **Overall Mobile Usability** | Severe | Action buttons scroll off-screen, no stage progress indicator, no back/leave navigation, no adaptation for solo use. |

# /stats/me — Critical Analysis

**Snapshot**: `03-09-2026-18-30.jpeg`
**Date**: 2026-03-09 18:30

---

## Element Critiques

### 1. Header Bar

- "StageCam" branding (gold italic) left, hamburger menu right, dark bar.
- **Critique**: Nothing wrong here. Standard mobile nav pattern, legible, stays out of the way. The gold italic feels theatrical and on-brand. No issues.

### 2. Page Title — "Your Role Call"

- Gold heading left-aligned below header.
- **Critique**: The wordplay ("Role Call" / "Roll Call") is clever and fits the theatre theme. However, it doesn't communicate what this page actually shows — is it my roles? My stats? My recordings? A new user would have to scroll to understand. The title prioritizes personality over clarity.

### 3. Summary Stat Cards

- Four gold-bordered cards in a row: **34** Recordings | **34** Unique Chunks | **1** Scripts | 13 dlg 20 act 1 hdr By Type
- **Critique**:
  - "Recordings" and "Unique Chunks" showing the same number (34/34) raises the question: why show both? If they're always identical, one is redundant. If they can differ, no explanation is given for what the difference means.
  - "Unique Chunks" is developer jargon. Users don't know what a "chunk" is.
  - "1 Scripts" — grammatically should be "1 Script". Also, with only one script in the system, this card is wasted space.
  - The "By Type" card is the worst offender: "13 dlg 20 act 1 hdr" is compressed shorthand that means nothing to a casual user. "hdr" for scene heading? "dlg" for dialogue? These abbreviations are never defined. The card also breaks the visual pattern — three cards have one big number, this one has a cramped text string.
  - The four cards don't add up to a story. What should I take away? "You've done 34 things" isn't motivating or actionable.

### 4. Character Role Cards (x4)

Each card: character name, script name, overall % progress bar, per-act bars with `done/total` counts.

- **Critique**:
  - **Good bones**: The card layout is clean. Character name + script + percentage is immediately readable. Per-act breakdown gives useful granularity.
  - **Progress bars are tiny and hard to read**: The per-act bars are thin grey lines. At low percentages (most of these), the filled portion is barely a sliver or invisible. The bars communicate almost nothing visually — the `x/y` numbers next to them do all the work, making the bars decorative.
  - **No distinction between roles**: Andy (42 total chunks) and Woody (274 total chunks) are presented identically. A user seeing "WOODY 0%" doesn't understand that Woody is a massive lead role and 0% is expected. There's no size/weight/difficulty context.
  - **Woody shows 0% but has 1/143 in Act 2**: The percentage rounds down to 0, which feels like a lie. If I've done work, show me something — even "< 1%".
  - **All four cards are the same script**: "Toy Story (1995)" is repeated four times. If the user only has one script, this is redundant visual noise. Could be grouped under a script header.
  - **No call to action**: I see I'm 17% on Andy. Now what? No "Continue" button, no link to the next unrecorded scene, no suggestion. It's a dashboard that informs but doesn't guide.
  - **Ordering unclear**: Cards appear ordered by percentage (17%, 10%, 8%, 0%) but this isn't labeled. Is higher better? Should I focus on the lowest one?

### 5. Recent Recordings List

- "RECENT RECORDINGS" header (muted uppercase), followed by 20+ rows. Each row: optional gold character name, scene heading, script name + date right-aligned.
- **Critique**:
  - **Extremely repetitive**: 7 consecutive identical rows of "ANDY INT. DOWNSTAIRS LIVING ROOM — Toy Story 3/8/2026". This is the worst part of the page. No user benefits from seeing the same line seven times. It's visual clutter that makes the list feel broken.
  - **No grouping or collapsing**: Recordings should be grouped by scene or session. "ANDY — INT. DOWNSTAIRS LIVING ROOM (7 recordings)" would replace 7 rows with 1.
  - **Rows without character names are confusing**: Some rows show just a scene heading with no gold character label (e.g., "INT. PIZZA PLANET DELIVERY TRUCK - CONTINUOUS"). Are these system chunks? Action lines? Errors? The inconsistency is unexplained and makes the list feel incomplete.
  - **No playback or interaction affordance**: These rows have no chevron, no play icon, no tap feedback indication. Are they interactive? If not, what's the point of listing individual recordings? If yes, it's not communicated.
  - **No pagination or virtual scroll**: The list renders fully, pushing the page to extreme length. With heavy usage this becomes unusable.
  - **Date formatting is inconsistent with the rest of the app**: Shows "3/8/2026" in US date format, small and right-aligned. Hard to scan.
  - **No empty state consideration**: What does this look like with 0 recordings? With 500?
  - **Takes up ~60% of the visible page**: The recordings list dominates the page but provides the least insight per pixel of any section. The role cards above are dense with meaning; this list is sparse and repetitive.

---

## Ranking: Least Criticized → Most Criticized

| Rank | Element | Severity | Summary |
|------|---------|----------|---------|
| 1 (least) | **Header Bar** | None | No issues. Clean, standard, on-brand. |
| 2 | **Page Title** | Minor | Clever but slightly unclear about page purpose. |
| 3 | **Character Role Cards** | Moderate | Good structure, but thin bars are decorative, no role-size context, no CTAs, and Woody's 0% is misleading. |
| 4 | **Summary Stat Cards** | Significant | Redundant data, developer jargon ("chunks"), cryptic abbreviations ("dlg/act/hdr"), no user-facing story. |
| 5 (most) | **Recent Recordings List** | Severe | 7 identical rows, no grouping, no interaction affordance, unexplained missing character names, dominates page with lowest information density. |

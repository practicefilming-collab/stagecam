# StageCam

Collaborative script rehearsal platform. Users join rooms, get assigned
characters and action lines from real movie scripts, record their
performances, and assemble them into composite scene playbacks.

## Architecture

- Next.js 14 App Router + TypeScript + Tailwind CSS
- Supabase (Postgres, Auth, Storage, Realtime)
- Cloudflare R2 for recording storage
- Dark theatrical theme (gold #d4af37, dark bg #0a0a0a)

## Data Pipeline

Scripts are chunked via Python pipeline (`top250_movies/`) into markdown
with YAML frontmatter, then seeded into Supabase via `supabase/seed/seed.ts`.

### Chunk Classification

Each chunk is typed (dialogue, action, scene_heading, transition) and
classified as either **performable** (users record these) or **system**
(always TTS narration — camera directions, SFX cues, short stage
directions <=15 chars). Coverage and completion are measured against
performable chunks only.

## Key Modules

- `src/lib/matchmaking/` — Scene selection, character assignment, chunk distribution
- `src/lib/matchmaking/coverage.ts` — Recording coverage calculations
- `src/components/player/` — Scene playback (recordings + TTS fallback)
- `src/components/stats/` — Script dashboard visualizations
- `src/app/api/` — API routes (rooms, recordings, stats, panels, scripts)
- `supabase/seed/` — Database seeding from pipeline data
- `supabase/migrations/` — Schema migrations

## Room Flow

1. Creator makes a room, selects a script, picks a scene (or auto-select)
2. Matchmaking assigns characters by dialogue weight, distributes action chunks
3. Participants record their assigned chunks
4. Scene player assembles recordings + TTS into sequential playback

## Getting Started

```bash
npm install
```

Create a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run the dev server:

```bash
npm run dev
```

Seed the database (requires service role key):

```bash
npx tsx supabase/seed/seed.ts
```

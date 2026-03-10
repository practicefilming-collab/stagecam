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
classified as either **rehearsable** (users record these) or **system**
(always TTS narration — camera directions, SFX cues, short stage
directions <=15 chars). Coverage and completion are measured against
rehearsable chunks only.

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
5. Users can export a merged scene MP4 on demand from the scene player

## Scene Export Download

- The scene player includes a download icon next to playback controls.
- Export runs asynchronously via job status in Supabase and processing in API worker flow.
- Output MP4 files are stored in Cloudflare R2 and delivered through short-lived signed URLs.
- Export builds one MP4 in playback order (recordings + TTS fallback segments).
- Fallback segments render replay text over a black frame and use TTS audio duration.
- Exports are retained for 24 hours and then expire.
- Server requires `ffmpeg` and `ffprobe` binaries (bundled installer or PATH) for export generation.

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

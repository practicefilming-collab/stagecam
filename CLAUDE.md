# StageCam — AI Development Guide

## Quick Reference
- Build: `npm run build` (must pass before committing)
- Dev: `npm run dev` (port 3000)
- Seed: `npx tsx supabase/seed/seed.ts` (requires SUPABASE_URL + SERVICE_ROLE_KEY)

## Key Concepts
- **Chunks**: Atomic script units (dialogue/action/scene_heading/transition)
- **System chunks**: `is_system = true` — always TTS, never assigned to users
- **Performable chunks**: `is_system = false` — what users record; coverage denominator
- **Coverage**: recorded_chunks / performable_chunks per scene
- **MAX_CHUNKS_PER_PERSON (12)**: Soft cap on non-dialogue action chunks per user in a room session. Does NOT limit dialogue. Exists to prevent one person getting all the filler.

## Conventions
- Dark theme: gold (#d4af37), bg (#0a0a0a), surface/border/muted Tailwind classes
- Mobile-first (portrait 9:16 video)
- Server components for API routes, client components for pages
- Supabase client: `createClient()` from `@/lib/supabase/client` (browser) or `server` (API routes)
- No chart libraries — pure CSS/Tailwind for visualizations

## File Map
- `src/lib/matchmaking/` — Core assignment logic (scene-selector → character-assigner → chunk-distributor)
- `src/lib/types.ts` — All TypeScript interfaces
- `src/app/api/` — REST endpoints
- `supabase/migrations/` — Schema (001-005)
- `supabase/seed/` — Seeding pipeline data into DB

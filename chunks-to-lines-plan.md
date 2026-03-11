# Chunks to Lines Rename Plan

## Summary
- Rename user-facing and app/API terminology from `chunk(s)` to `line(s)`.
- Keep the Supabase schema, storage layout, and external pipeline chunk-based for compatibility.
- Preserve archive docs in `prd-board/` and `redev/` as historical records.

## Key Changes
- App routes now emit line-based DTOs such as `totalLines`, `recordedLines`, `rehearsableLines`, `lineBreakdown`, `line_id`, and `lineId`.
- Recording endpoints accept both legacy chunk keys and new line keys.
- Stage, stats, panel, playback, and terms UI copy now refers to lines instead of chunks.
- Shared TS types now expose additive line aliases (`Line`, `AssignedLine`, `LineType`, `ParsedLine`, `LineLike`) while keeping chunk aliases available.

## Compatibility Notes
- Database tables and columns remain unchanged: `chunks`, `chunk_id`, `assigned_chunks`, `total_chunks`, `rehearsable_chunks`, `chunk_likes`.
- Seed and pipeline adapters still read chunk-shaped source metadata and paths such as `scripts_chunked`, `individual chunks`, `chunk_index`, and `chunk_in_scene`.
- Internal Supabase joins and DB-row handling may still reference chunk-shaped names where required.

## Validation
- Run `npm run build`.
- Search for remaining `chunk` references and confirm they are compatibility seams, DB schema names, seed/pipeline adapters, or preserved historical docs.

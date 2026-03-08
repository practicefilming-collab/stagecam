-- Add character_stats JSONB column to scenes table
-- Shape: [{ "name": "WOODY", "dialogue_chunks": 18, "total_chunks": 22 }, ...]
-- Sorted by dialogue_chunks DESC. Computed at seed time.
ALTER TABLE scenes ADD COLUMN character_stats JSONB DEFAULT '[]';

#!/usr/bin/env npx ts-node
/**
 * CLI script to seed Supabase from the top250_movies pipeline data.
 *
 * Usage:
 *   npx ts-node scripts/seed-from-pipeline.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

// Re-export the seed script
import '../supabase/seed/seed';

/**
 * Seed Toy Story data into Supabase.
 * Run: npx ts-node --esm scripts/seed-toy-story.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const PIPELINE_DIR = 'C:/Users/KYC/Desktop/top250_movies';
const CHUNKED_FILE = path.join(PIPELINE_DIR, 'scripts_chunked', '077 - Toy Story (1995).md');
const AUDIO_DIR = path.join(PIPELINE_DIR, 'individual chunks', '077 - Toy Story (1995)');

const SUPABASE_URL = 'https://duyncjjwelytkvixygag.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1eW5jamp3ZWx5dGt2aXh5Z2FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg5MjU1NCwiZXhwIjoyMDg4NDY4NTU0fQ.d30Z_azeODE-J9dzqr1bSetHBL8hvZIJQC7naaqJPCs';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Parse chunks from markdown ──

interface ParsedChunk {
  act: number;
  scene: number;
  scene_heading: string;
  chunk_index: number;
  chunk_in_scene: number;
  type: string;
  character?: string;
  content: string;
}

function parseChunkedScript(filePath: string): ParsedChunk[] {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  const chunks: ParsedChunk[] = [];

  let i = 0;
  while (i < lines.length) {
    // Find opening ---
    if (lines[i].trim() !== '---') { i++; continue; }
    i++;

    // Read YAML key-value pairs until closing ---
    const meta: Record<string, string> = {};
    while (i < lines.length && lines[i].trim() !== '---') {
      const m = lines[i].match(/^([A-Za-z_]\w*)\s*:\s*(.*)$/);
      if (m) {
        let val = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        meta[m[1]] = val;
      }
      i++;
    }
    if (i >= lines.length) break;
    i++; // skip closing ---

    // Read body until next --- or EOF
    const bodyLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '---') {
      bodyLines.push(lines[i]);
      i++;
    }

    const chunkIndex = parseInt(meta['chunk_index']);
    if (isNaN(chunkIndex)) continue;

    chunks.push({
      act: parseInt(meta['act']) || 1,
      scene: parseInt(meta['scene']) || 0,
      scene_heading: meta['scene_heading'] ?? '',
      chunk_index: chunkIndex,
      chunk_in_scene: parseInt(meta['chunk_in_scene']) || 1,
      type: meta['type'] || 'action',
      character: meta['character'] || undefined,
      content: bodyLines.join('\n').trim(),
    });
  }

  return chunks;
}

// ── Upload audio files ──

async function uploadAudio(scriptId: string): Promise<Map<number, string>> {
  const audioMap = new Map<number, string>();

  if (!fs.existsSync(AUDIO_DIR)) {
    console.log('No audio directory found, skipping audio upload');
    return audioMap;
  }

  const actDirs = fs.readdirSync(AUDIO_DIR).filter(d =>
    fs.statSync(path.join(AUDIO_DIR, d)).isDirectory()
  );

  for (const actDir of actDirs) {
    const actPath = path.join(AUDIO_DIR, actDir);
    const sceneDirs = fs.readdirSync(actPath).filter(d =>
      fs.statSync(path.join(actPath, d)).isDirectory()
    );

    for (const sceneDir of sceneDirs) {
      const scenePath = path.join(actPath, sceneDir);
      const wavFiles = fs.readdirSync(scenePath).filter(f => f.endsWith('.wav'));

      for (const wavFile of wavFiles) {
        const idxMatch = wavFile.match(/^(\d+)__/);
        if (!idxMatch) continue;

        const chunkIdx = parseInt(idxMatch[1], 10);
        const storagePath = `${scriptId}/${actDir}/${sceneDir}/${wavFile}`;
        const localPath = path.join(scenePath, wavFile);

        try {
          const buf = fs.readFileSync(localPath);
          const { error } = await supabase.storage
            .from('tts-audio')
            .upload(storagePath, buf, { contentType: 'audio/wav', upsert: true });

          if (error) {
            console.error(`  Audio upload failed ${storagePath}: ${error.message}`);
          } else {
            audioMap.set(chunkIdx, storagePath);
          }
        } catch (err) {
          console.error(`  Error reading ${localPath}:`, err);
        }
      }
    }
  }

  return audioMap;
}

// ── Main ──

async function main() {
  console.log('Seeding Toy Story into Supabase...\n');

  // Parse chunks
  const chunks = parseChunkedScript(CHUNKED_FILE);
  console.log(`Parsed ${chunks.length} chunks from markdown`);

  const dialogueCount = chunks.filter(c => c.type === 'dialogue').length;
  const uniqueChars = [...new Set(chunks.filter(c => c.character).map(c => c.character!))];
  console.log(`  ${dialogueCount} dialogue chunks, ${uniqueChars.length} unique characters`);

  // Compute structure
  const actNumbers = [...new Set(chunks.map(c => c.act))].sort((a, b) => a - b);
  const scenesByAct = new Map<number, Set<number>>();
  const sceneHeadings = new Map<string, string>();

  for (const chunk of chunks) {
    if (!scenesByAct.has(chunk.act)) scenesByAct.set(chunk.act, new Set());
    scenesByAct.get(chunk.act)!.add(chunk.scene);
    sceneHeadings.set(`${chunk.act}:${chunk.scene}`, chunk.scene_heading);
  }

  const totalScenes = [...scenesByAct.values()].reduce((s, set) => s + set.size, 0);

  // Insert script
  const slug = 'toy-story';
  const { data: scriptRecord, error: scriptErr } = await supabase
    .from('scripts')
    .upsert({
      title: 'Toy Story',
      rank: 77,
      year: 1995,
      slug,
      total_acts: actNumbers.length,
      total_scenes: totalScenes,
      total_chunks: chunks.length,
      storage_prefix: '077 - Toy Story (1995)',
    }, { onConflict: 'slug' })
    .select()
    .single();

  if (scriptErr) {
    console.error('Failed to insert script:', scriptErr.message);
    return;
  }

  const scriptId = scriptRecord.id;
  console.log(`\nScript ID: ${scriptId}`);

  // Upload audio
  console.log('\nUploading audio files...');
  const audioMap = await uploadAudio(scriptId);
  console.log(`Uploaded ${audioMap.size} audio files`);

  // Insert acts, scenes, chunks
  console.log('\nInserting acts, scenes, chunks...');

  for (const actNum of actNumbers) {
    const actChunks = chunks.filter(c => c.act === actNum);
    const actScenes = [...(scenesByAct.get(actNum) ?? [])].sort((a, b) => a - b);

    const { data: actRecord, error: actErr } = await supabase
      .from('acts')
      .upsert({
        script_id: scriptId,
        act_number: actNum,
        total_scenes: actScenes.length,
        total_chunks: actChunks.length,
      }, { onConflict: 'script_id,act_number' })
      .select()
      .single();

    if (actErr) {
      console.error(`  Act ${actNum} error:`, actErr.message);
      continue;
    }

    console.log(`  Act ${actNum}: ${actScenes.length} scenes, ${actChunks.length} chunks`);

    for (const sceneNum of actScenes) {
      const sceneChunks = actChunks.filter(c => c.scene === sceneNum);
      const heading = sceneHeadings.get(`${actNum}:${sceneNum}`) ?? '';
      const uniqueCharacters = [...new Set(
        sceneChunks.filter(c => c.type === 'dialogue' && c.character).map(c => c.character!)
      )];

      const { data: sceneRecord, error: sceneErr } = await supabase
        .from('scenes')
        .upsert({
          act_id: actRecord.id,
          scene_number: sceneNum,
          scene_heading: heading,
          total_chunks: sceneChunks.length,
          unique_characters: uniqueCharacters,
        }, { onConflict: 'act_id,scene_number' })
        .select()
        .single();

      if (sceneErr) {
        console.error(`    Scene ${sceneNum} error:`, sceneErr.message);
        continue;
      }

      // Batch insert chunks
      const chunkRows = sceneChunks.map(c => ({
        scene_id: sceneRecord.id,
        chunk_index: c.chunk_index,
        chunk_in_scene: c.chunk_in_scene,
        type: c.type,
        character: c.character ?? null,
        tts_text: c.content,
        chunk_text: c.content,
        tts_audio_url: audioMap.get(c.chunk_index) ?? null,
      }));

      // Insert in batches of 100
      for (let i = 0; i < chunkRows.length; i += 100) {
        const batch = chunkRows.slice(i, i + 100);
        const { error: chunkErr } = await supabase.from('chunks').insert(batch);
        if (chunkErr) {
          console.error(`    Chunk batch error (scene ${sceneNum}):`, chunkErr.message);
        }
      }
    }
  }

  // Verify
  const { count: totalInDb } = await supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true });

  console.log(`\nDone! ${totalInDb} chunks in database.`);
}

main().catch(console.error);

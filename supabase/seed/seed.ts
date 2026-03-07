import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseChunkedScript, extractTtsText } from './parse-chunks';
import { uploadAudioFiles } from './upload-audio';

// Configuration
const PIPELINE_DIR = 'C:/Users/KYC/Desktop/top250_movies';
const SCRIPTS_CHUNKED_DIR = path.join(PIPELINE_DIR, 'scripts_chunked');
const INDIVIDUAL_CHUNKS_DIR = path.join(PIPELINE_DIR, 'individual chunks');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function seedScript(filename: string) {
  const filePath = path.join(SCRIPTS_CHUNKED_DIR, filename);
  console.log(`\nProcessing: ${filename}`);

  // Parse the filename: "077 - Toy Story (1995).md"
  const nameMatch = filename.match(/^(\d+)\s*-\s*(.+?)\s*\((\d{4})\)\.md$/);
  if (!nameMatch) {
    console.log(`  Skipping: can't parse filename`);
    return;
  }

  const rank = parseInt(nameMatch[1], 10);
  const title = nameMatch[2].trim();
  const year = parseInt(nameMatch[3], 10);
  const storagePrefix = filename.replace('.md', '');
  const slug = slugify(title);

  // Parse chunks from the markdown file
  const chunks = parseChunkedScript(filePath);
  if (chunks.length === 0) {
    console.log(`  Skipping: no chunks parsed`);
    return;
  }

  // Validate: check for dialogue chunks
  const dialogueCount = chunks.filter((c) => c.type === 'dialogue').length;
  if (dialogueCount === 0) {
    console.warn(`  WARNING: ${title} has 0 dialogue chunks - may need re-processing`);
  }

  // Compute structure
  const actNumbers = [...new Set(chunks.map((c) => c.act))].sort((a, b) => a - b);
  const scenesByAct = new Map<number, Set<number>>();
  const sceneHeadings = new Map<string, string>(); // "act:scene" -> heading

  for (const chunk of chunks) {
    const key = chunk.act;
    if (!scenesByAct.has(key)) scenesByAct.set(key, new Set());
    scenesByAct.get(key)!.add(chunk.scene);
    sceneHeadings.set(`${chunk.act}:${chunk.scene}`, chunk.scene_heading);
  }

  const totalScenes = [...scenesByAct.values()].reduce((s, set) => s + set.size, 0);

  // Insert script
  const { data: scriptRecord, error: scriptError } = await supabase
    .from('scripts')
    .upsert({
      title,
      rank,
      year,
      slug,
      total_acts: actNumbers.length,
      total_scenes: totalScenes,
      total_chunks: chunks.length,
      storage_prefix: storagePrefix,
    }, { onConflict: 'slug' })
    .select()
    .single();

  if (scriptError) {
    console.error(`  Error inserting script:`, scriptError.message);
    return;
  }

  const scriptId = scriptRecord.id;
  console.log(`  Script ID: ${scriptId}`);

  // Upload audio files if they exist
  const audioMap = await uploadAudioFiles(
    INDIVIDUAL_CHUNKS_DIR,
    storagePrefix,
    scriptId,
    supabase
  );
  console.log(`  Uploaded ${audioMap.size} audio files`);

  // Insert acts, scenes, chunks
  for (const actNum of actNumbers) {
    const actChunks = chunks.filter((c) => c.act === actNum);
    const actScenes = [...(scenesByAct.get(actNum) ?? [])].sort((a, b) => a - b);

    const { data: actRecord, error: actError } = await supabase
      .from('acts')
      .upsert({
        script_id: scriptId,
        act_number: actNum,
        total_scenes: actScenes.length,
        total_chunks: actChunks.length,
      }, { onConflict: 'script_id,act_number' })
      .select()
      .single();

    if (actError) {
      console.error(`  Error inserting act ${actNum}:`, actError.message);
      continue;
    }

    for (const sceneNum of actScenes) {
      const sceneChunks = actChunks.filter((c) => c.scene === sceneNum);
      const heading = sceneHeadings.get(`${actNum}:${sceneNum}`) ?? '';

      // Extract unique characters from dialogue chunks
      const uniqueCharacters = [...new Set(
        sceneChunks
          .filter((c) => c.type === 'dialogue' && c.character)
          .map((c) => c.character!)
      )];

      const { data: sceneRecord, error: sceneError } = await supabase
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

      if (sceneError) {
        console.error(`  Error inserting scene ${sceneNum}:`, sceneError.message);
        continue;
      }

      // Insert chunks
      for (const chunk of sceneChunks) {
        const ttsText = extractTtsText(chunk.content, chunk.type);
        const audioUrl = audioMap.get(chunk.chunk_index) ?? null;

        await supabase.from('chunks').upsert({
          scene_id: sceneRecord.id,
          chunk_index: chunk.chunk_index,
          chunk_in_scene: chunk.chunk_in_scene,
          type: chunk.type,
          character: chunk.character ?? null,
          tts_text: ttsText,
          chunk_text: chunk.content,
          tts_audio_url: audioUrl,
        }, {
          onConflict: 'scene_id,chunk_index',
          ignoreDuplicates: false,
        });
      }
    }
  }

  console.log(`  Done: ${actNumbers.length} acts, ${totalScenes} scenes, ${chunks.length} chunks`);
}

async function main() {
  console.log('StageCam Seed Script');
  console.log('====================');
  console.log(`Pipeline dir: ${PIPELINE_DIR}`);

  // List all chunked scripts
  const files = fs.readdirSync(SCRIPTS_CHUNKED_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  console.log(`Found ${files.length} scripts to seed\n`);

  for (const file of files) {
    await seedScript(file);
  }

  console.log('\n\nSeeding complete!');
}

main().catch(console.error);

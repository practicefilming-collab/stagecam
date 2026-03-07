import * as fs from 'fs';
import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'tts-audio';

export async function uploadAudioFiles(
  individualChunksDir: string,
  movieFolder: string,
  scriptId: string,
  supabase: SupabaseClient
): Promise<Map<number, string>> {
  const audioMap = new Map<number, string>(); // chunk_index -> storage path
  const moviePath = path.join(individualChunksDir, movieFolder);

  if (!fs.existsSync(moviePath)) {
    console.log(`No individual chunks directory for: ${movieFolder}`);
    return audioMap;
  }

  const actDirs = fs.readdirSync(moviePath).filter((d) =>
    fs.statSync(path.join(moviePath, d)).isDirectory()
  );

  for (const actDir of actDirs) {
    const actPath = path.join(moviePath, actDir);
    const sceneDirs = fs.readdirSync(actPath).filter((d) =>
      fs.statSync(path.join(actPath, d)).isDirectory()
    );

    for (const sceneDir of sceneDirs) {
      const scenePath = path.join(actPath, sceneDir);
      const files = fs.readdirSync(scenePath).filter((f) => f.endsWith('.wav'));

      for (const wavFile of files) {
        // Extract chunk index from filename: e.g., "0001__scene_heading__tts.wav"
        const match = wavFile.match(/^(\d+)__/);
        if (!match) continue;

        const chunkIndex = parseInt(match[1], 10);
        const localPath = path.join(scenePath, wavFile);
        const storagePath = `${scriptId}/${actDir}/${sceneDir}/${wavFile}`;

        try {
          const fileBuffer = fs.readFileSync(localPath);
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, fileBuffer, {
              contentType: 'audio/wav',
              upsert: true,
            });

          if (error) {
            console.error(`Failed to upload ${storagePath}:`, error.message);
          } else {
            audioMap.set(chunkIndex, storagePath);
          }
        } catch (err) {
          console.error(`Error uploading ${localPath}:`, err);
        }
      }
    }
  }

  return audioMap;
}

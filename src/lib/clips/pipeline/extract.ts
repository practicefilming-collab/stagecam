import type { SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { uploadToR2, clipKeys } from './storage';

const FFMPEG_BIN = process.env.FFMPEG_PATH || ffmpegInstaller.path || 'ffmpeg';

/** Run an ffmpeg command and wait for completion. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

/**
 * Extract audio from the downloaded video as WAV (for analysis) and AAC (for playback).
 * Uploads both to R2 and updates the clip record.
 * Returns the local WAV path for the analyze stage.
 */
export async function extractAudio(
  supabase: SupabaseClient,
  clipId: string,
  videoPath: string,
): Promise<{ wavPath: string; aacPath: string }> {
  await supabase
    .from('clips')
    .update({ pipeline_status: 'extracting', updated_at: new Date().toISOString() })
    .eq('id', clipId);

  const dir = path.dirname(videoPath);
  const wavPath = path.join(dir, `${clipId}.wav`);
  const aacPath = path.join(dir, `${clipId}.aac`);

  // Extract WAV: 44100 Hz, 16-bit signed PCM, mono
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '1',
    wavPath,
  ]);

  // Extract AAC: 192 kbps (delivery format for playback)
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vn',
    '-acodec', 'aac',
    '-b:a', '192k',
    aacPath,
  ]);

  // Upload to R2
  const wavKey = clipKeys.audioWav(clipId);
  const aacKey = clipKeys.audioAac(clipId);
  await uploadToR2(wavPath, wavKey, 'audio/wav');
  await uploadToR2(aacPath, aacKey, 'audio/aac');

  // Update clip record
  await supabase
    .from('clips')
    .update({
      audio_wav_path: wavKey,
      audio_aac_path: aacKey,
      pipeline_status: 'analyzing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId);

  return { wavPath, aacPath };
}

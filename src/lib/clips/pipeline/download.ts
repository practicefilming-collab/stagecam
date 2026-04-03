import type { SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { uploadToR2, clipKeys } from './storage';
import { CLIP_MAX_DURATION_MS } from '@/lib/constants';

const FFPROBE_BIN = process.env.FFPROBE_PATH || ffprobeInstaller.path || 'ffprobe';

/** Probe duration in seconds from a local video file. */
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
    const child = spawn(FFPROBE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (${code}): ${stderr.slice(-1200)}`));
        return;
      }
      const duration = Number.parseFloat(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error(`Invalid media duration: ${stdout.trim()}`));
        return;
      }
      resolve(duration);
    });
  });
}

/** Compute SHA-256 hash of a file. */
async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Download a video from the source URL, store to R2, and update the clip record.
 * Also attempts to pull platform subtitles via yt-dlp --write-subs.
 * Returns the temp directory, local video path, and any downloaded subtitle path.
 */
export async function downloadVideo(
  supabase: SupabaseClient,
  clipId: string,
): Promise<{ tmpDir: string; videoPath: string; subtitlePath: string | null }> {
  // Get clip source URL
  const { data: clip, error: fetchError } = await supabase
    .from('clips')
    .select('source_url')
    .eq('id', clipId)
    .single();

  if (fetchError || !clip) {
    throw new Error('Clip not found');
  }

  // Update status
  await supabase
    .from('clips')
    .update({ pipeline_status: 'downloading', pipeline_error: null, updated_at: new Date().toISOString() })
    .eq('id', clipId);

  // Create temp directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stagecam-clip-'));
  const videoPath = path.join(tmpDir, `${clipId}.mp4`);

  try {
    // Dynamic import yt-dlp-exec (ESM module)
    const { default: ytDlp } = await import('yt-dlp-exec');

    await ytDlp(clip.source_url, {
      output: videoPath,
      format: 'mp4',
      writeSub: true,
      writeAutoSub: true,
      subLang: 'en',
      subFormat: 'json3',
      noCheckCertificate: true,
      noWarnings: true,
    });

    // Check for downloaded subtitle files (yt-dlp writes them alongside the video)
    let subtitlePath: string | null = null;
    const tmpFiles = await fs.readdir(tmpDir);
    const subFile = tmpFiles.find((f) => f.endsWith('.json3') || f.endsWith('.vtt') || f.endsWith('.srt'));
    if (subFile) {
      subtitlePath = path.join(tmpDir, subFile);
    }

    // Verify file exists
    const stat = await fs.stat(videoPath);
    if (stat.size === 0) {
      throw new Error('Downloaded video file is empty');
    }

    // Get duration via ffprobe
    const durationSeconds = await probeDuration(videoPath);
    const durationMs = Math.round(durationSeconds * 1000);

    if (durationMs > CLIP_MAX_DURATION_MS) {
      throw new Error(`Video duration ${Math.round(durationMs / 1000)}s exceeds maximum ${CLIP_MAX_DURATION_MS / 1000}s`);
    }

    // Compute checksum
    const checksum = await hashFile(videoPath);

    // Upload to R2
    const r2Key = clipKeys.video(clipId);
    await uploadToR2(videoPath, r2Key, 'video/mp4');

    // Update clip record
    await supabase
      .from('clips')
      .update({
        video_storage_path: r2Key,
        video_file_size_bytes: stat.size,
        video_checksum: checksum,
        duration_ms: durationMs,
        pipeline_status: 'extracting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId);

    return { tmpDir, videoPath, subtitlePath };
  } catch (err) {
    // Clean up on error — let orchestrator handle the tmpDir cleanup
    throw err;
  }
}

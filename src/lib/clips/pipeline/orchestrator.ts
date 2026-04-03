import { createAdminClient } from '@/lib/supabase/admin';
import { promises as fs } from 'fs';
import { downloadVideo } from './download';
import { extractAudio } from './extract';
import { analyzeAudio } from './analyze';

/**
 * Run the full clip processing pipeline: download → extract → analyze.
 *
 * Each stage updates the clip's pipeline_status in the database.
 * On failure at any stage, the status is set to 'failed' with the error message.
 * Temp files are always cleaned up.
 */
export async function runPipeline(clipId: string): Promise<void> {
  const admin = createAdminClient();
  let tmpDir: string | null = null;

  try {
    // Stage 1: Download video
    const downloadResult = await downloadVideo(admin, clipId);
    tmpDir = downloadResult.tmpDir;

    // Stage 2: Extract audio (WAV + AAC)
    const { wavPath } = await extractAudio(admin, clipId, downloadResult.videoPath);

    // Stage 3: Analyze audio (beat detection + speech-to-text + auto-segment)
    // Pass platform subtitles if yt-dlp downloaded them — Whisper is only the fallback
    await analyzeAudio(admin, clipId, wavPath, downloadResult.subtitlePath);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from('clips')
      .update({
        pipeline_status: 'failed',
        pipeline_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId);
  } finally {
    // Always clean up temp directory
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

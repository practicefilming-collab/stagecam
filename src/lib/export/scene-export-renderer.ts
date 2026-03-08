import { PlaybackItem, ScenePlaybackData } from '@/lib/player/build-scene-playback';
import { slugify } from '@/lib/utils';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Jimp, loadFont, HorizontalAlign } from 'jimp';

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const OUTPUT_FPS = 30;
const FFMPEG_BIN = process.env.FFMPEG_PATH || ffmpegInstaller.path || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || ffprobeInstaller.path || 'ffprobe';
const require = createRequire(import.meta.url);
const FONT_SMALL = require.resolve('@jimp/plugin-print/fonts/open-sans/open-sans-32-white/open-sans-32-white.fnt');
const FONT_MEDIUM = require.resolve('@jimp/plugin-print/fonts/open-sans/open-sans-64-white/open-sans-64-white.fnt');

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} failed with code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function renderRecordingSegment(outputPath: string, recordingUrl: string): Promise<void> {
  const args = [
    '-y',
    '-i',
    recordingUrl,
    '-vf',
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${OUTPUT_FPS},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    outputPath,
  ];
  await runProcess(FFMPEG_BIN, args);
}

let smallFontPromise: Promise<Awaited<ReturnType<typeof loadFont>>> | null = null;
let mediumFontPromise: Promise<Awaited<ReturnType<typeof loadFont>>> | null = null;

async function getSmallFont() {
  if (!smallFontPromise) {
    smallFontPromise = loadFont(FONT_SMALL);
  }
  return smallFontPromise;
}

async function getMediumFont() {
  if (!mediumFontPromise) {
    mediumFontPromise = loadFont(FONT_MEDIUM);
  }
  return mediumFontPromise;
}

async function createTtsTextCard(cardPath: string, item: PlaybackItem): Promise<void> {
  const image = new Jimp({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, color: 0x000000ff });
  const smallFont = await getSmallFont();
  const mediumFont = await getMediumFont();
  const marginX = 48;
  const maxWidth = OUTPUT_WIDTH - marginX * 2;

  const topLabel = item.isSystem ? 'NARRATOR' : item.type === 'scene_heading' ? 'SCENE HEADING' : '';
  if (topLabel) {
    image.print({
      font: smallFont,
      x: marginX,
      y: Math.floor(OUTPUT_HEIGHT * 0.18),
      text: { text: topLabel, alignmentX: HorizontalAlign.CENTER },
      maxWidth,
      maxHeight: 80,
    });
  }

  if (item.character) {
    image.print({
      font: mediumFont,
      x: marginX,
      y: Math.floor(OUTPUT_HEIGHT * 0.28),
      text: { text: item.character, alignmentX: HorizontalAlign.CENTER },
      maxWidth,
      maxHeight: 120,
    });
  }

  image.print({
    font: smallFont,
    x: marginX,
    y: Math.floor(OUTPUT_HEIGHT * 0.44),
    text: { text: item.text, alignmentX: HorizontalAlign.CENTER },
    maxWidth,
    maxHeight: Math.floor(OUTPUT_HEIGHT * 0.42),
  });

  await image.write(cardPath as `${string}.${string}`);
}

async function renderTtsSegment(outputPath: string, item: PlaybackItem): Promise<void> {
  if (!item.ttsUrl) {
    throw new Error(`Chunk ${item.chunkId} has no recording and no TTS audio`);
  }

  const cardPath = `${outputPath}.png`;
  await createTtsTextCard(cardPath, item);

  const args = [
    '-y',
    '-loop',
    '1',
    '-i',
    cardPath,
    '-i',
    item.ttsUrl,
    '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-r', `${OUTPUT_FPS}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', outputPath,
  ];

  await runProcess(FFMPEG_BIN, args);
  await fs.rm(cardPath, { force: true });
}

async function buildSegment(outputPath: string, item: PlaybackItem): Promise<void> {
  if (item.hasRecording && item.recordingUrl) {
    await renderRecordingSegment(outputPath, item.recordingUrl);
    return;
  }
  await renderTtsSegment(outputPath, item);
}

async function concatenateSegments(segmentPaths: string[], outputPath: string, listPath: string): Promise<void> {
  const lines = segmentPaths.map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`);
  await fs.writeFile(listPath, `${lines.join('\n')}\n`, 'utf8');
  await runProcess(FFMPEG_BIN, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
}

export async function hasExportBinaries(): Promise<boolean> {
  try {
    await Promise.all([runProcess(FFMPEG_BIN, ['-version']), runProcess(FFPROBE_BIN, ['-version'])]);
    return true;
  } catch {
    return false;
  }
}

export async function renderSceneExportToFile(
  playback: ScenePlaybackData,
  onProgress?: (pct: number) => Promise<void> | void
): Promise<{ tmpRoot: string; outputPath: string }> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'stagecam-export-'));
  const segmentPaths: string[] = [];
  const outputPath = path.join(tmpRoot, 'scene.mp4');
  const concatListPath = path.join(tmpRoot, 'concat.txt');

  try {
    for (let i = 0; i < playback.items.length; i += 1) {
      const segmentPath = path.join(tmpRoot, `segment-${String(i).padStart(4, '0')}.mp4`);
      await buildSegment(segmentPath, playback.items[i]);
      segmentPaths.push(segmentPath);
      if (onProgress) {
        const pct = Math.min(95, Math.floor(((i + 1) / playback.items.length) * 90));
        await onProgress(pct);
      }
    }
    await concatenateSegments(segmentPaths, outputPath, concatListPath);
    if (onProgress) await onProgress(100);
    return { tmpRoot, outputPath };
  } catch (error) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    throw error;
  }
}

export function toDownloadFilename(scriptTitle: string, actNumber: number, sceneNumber: number): string {
  const base = slugify(scriptTitle || 'scene');
  return `${base || 'scene'}-act-${actNumber}-scene-${sceneNumber}.mp4`;
}

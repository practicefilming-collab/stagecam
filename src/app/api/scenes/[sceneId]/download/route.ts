import { createClient } from '@/lib/supabase/server';
import { buildScenePlaybackData, PlaybackItem } from '@/lib/player/build-scene-playback';
import { slugify } from '@/lib/utils';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;
const OUTPUT_FPS = 30;

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

async function hasCommand(command: string): Promise<boolean> {
  try {
    await runProcess(command, ['-version']);
    return true;
  } catch {
    return false;
  }
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

async function probeDurationSeconds(inputUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputUrl,
    ];
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
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
  await runProcess('ffmpeg', args);
}

async function renderTtsSegment(outputPath: string, item: PlaybackItem): Promise<void> {
  if (!item.ttsUrl) {
    throw new Error(`Chunk ${item.chunkId} has no recording and no TTS audio`);
  }

  const ttsDuration = await probeDurationSeconds(item.ttsUrl);
  const topLabel = item.isSystem ? 'Narrator' : item.type === 'scene_heading' ? 'Scene Heading' : '';
  const characterLine = item.character ?? '';
  const chunkText = item.text;

  const filter = [
    `color=c=black:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${ttsDuration}`,
    `drawtext=text='${escapeDrawtext(topLabel)}':fontsize=28:fontcolor=#d4af37:x=(w-text_w)/2:y=(h*0.18):enable='gt(${topLabel ? '1' : '0'},0)'`,
    `drawtext=text='${escapeDrawtext(characterLine)}':fontsize=44:fontcolor=#d4af37:x=(w-text_w)/2:y=(h*0.30):enable='gt(${characterLine ? '1' : '0'},0)'`,
    `drawtext=text='${escapeDrawtext(chunkText)}':fontsize=30:fontcolor=white:line_spacing=8:box=0:x=(w-text_w)/2:y=(h*0.44)`,
  ].join(',');

  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    filter,
    '-i',
    item.ttsUrl,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-shortest',
    '-r',
    `${OUTPUT_FPS}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
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

  await runProcess('ffmpeg', args);
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
  await runProcess('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    outputPath,
  ]);
}

function toDownloadName(scriptTitle: string, actNumber: number, sceneNumber: number): string {
  const base = slugify(scriptTitle || 'scene');
  return `${base || 'scene'}-act-${actNumber}-scene-${sceneNumber}.mp4`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [hasFfmpeg, hasFfprobe] = await Promise.all([hasCommand('ffmpeg'), hasCommand('ffprobe')]);
  if (!hasFfmpeg || !hasFfprobe) {
    return NextResponse.json(
      { error: 'Scene export is unavailable because ffmpeg/ffprobe are not installed on the server.' },
      { status: 503 }
    );
  }

  const playback = await buildScenePlaybackData(supabase, sceneId);
  if (!playback) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
  }

  if (playback.items.length === 0) {
    return NextResponse.json({ error: 'No chunks found for scene' }, { status: 400 });
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'stagecam-export-'));
  const segmentPaths: string[] = [];
  const outputPath = path.join(tmpRoot, 'scene.mp4');
  const concatListPath = path.join(tmpRoot, 'concat.txt');

  try {
    for (let i = 0; i < playback.items.length; i += 1) {
      const segmentPath = path.join(tmpRoot, `segment-${String(i).padStart(4, '0')}.mp4`);
      await buildSegment(segmentPath, playback.items[i]);
      segmentPaths.push(segmentPath);
    }

    await concatenateSegments(segmentPaths, outputPath, concatListPath);
    const output = await fs.readFile(outputPath);
    const filename = toDownloadName(
      playback.scene.scriptTitle,
      playback.scene.actNumber,
      playback.scene.sceneNumber
    );

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export scene';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

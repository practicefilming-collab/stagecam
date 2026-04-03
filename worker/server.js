import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT || 8080;
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
const MAX_DURATION_MS = 180_000;

// Supabase admin client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// R2 client
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET = process.env.R2_BUCKET_NAME;

// ── Helpers ──

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => stdout += c);
    child.stderr.on('data', c => stderr += c);
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function uploadToR2(localPath, key, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: createReadStream(localPath),
    ContentType: contentType,
  }));
}

async function uploadJsonToR2(data, key) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  }));
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', c => hash.update(c));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ── Metadata endpoint ──

async function handleMetadata(req, res) {
  const { url } = await readBody(req);
  if (!url) return respond(res, 400, { error: 'url required' });

  try {
    const stdout = await run('yt-dlp', [
      '--dump-single-json', '--no-check-certificate', '--no-warnings', '--skip-download', url,
    ]);
    const info = JSON.parse(stdout);

    const platform = url.includes('tiktok.com') ? 'tiktok'
      : url.includes('instagram.com/reel') ? 'instagram_reel'
      : url.includes('youtube.com/shorts') ? 'youtube_short' : 'other';

    respond(res, 200, {
      display_title: info.title || info.fulltitle || '',
      creator_name: info.creator || info.uploader || info.channel || '',
      creator_handle: info.uploader_id ? `@${info.uploader_id.replace(/^@/, '')}` : '',
      duration_ms: Math.round((info.duration || 0) * 1000),
      description: info.description || '',
      source_platform: platform,
      source_url: url,
    });
  } catch (err) {
    respond(res, 200, {
      error: err.message,
      display_title: '', creator_name: '', creator_handle: '',
      duration_ms: 0, description: '',
      source_platform: 'other', source_url: url,
    });
  }
}

// ── Pipeline endpoint ──

async function handlePipeline(req, res) {
  const { clipId } = await readBody(req);
  if (!clipId) return respond(res, 400, { error: 'clipId required' });

  // Return immediately — process in background
  respond(res, 202, { status: 'started', clipId });

  let tmpDir = null;
  try {
    const { data: clip } = await supabase.from('clips').select('source_url').eq('id', clipId).single();
    if (!clip) throw new Error('Clip not found');

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'));
    const videoPath = path.join(tmpDir, `${clipId}.mp4`);

    // ── Stage 1: Download ──
    await supabase.from('clips').update({ pipeline_status: 'downloading', pipeline_error: null }).eq('id', clipId);

    await run('yt-dlp', [
      '-o', videoPath, '-f', 'mp4',
      '--write-subs', '--write-auto-subs', '--sub-lang', 'en', '--sub-format', 'json3',
      '--no-check-certificate', '--no-warnings', clip.source_url,
    ]);

    const stat = await fs.stat(videoPath);
    if (stat.size === 0) throw new Error('Downloaded video is empty');

    // ffprobe duration
    const durationStr = await run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
    ]);
    const durationMs = Math.round(parseFloat(durationStr.trim()) * 1000);
    if (durationMs > MAX_DURATION_MS) throw new Error(`Duration ${Math.round(durationMs/1000)}s exceeds 180s max`);

    const checksum = await hashFile(videoPath);
    const videoKey = `clips/videos/${clipId}.mp4`;
    await uploadToR2(videoPath, videoKey, 'video/mp4');

    await supabase.from('clips').update({
      video_storage_path: videoKey, video_file_size_bytes: stat.size,
      video_checksum: checksum, duration_ms: durationMs,
      pipeline_status: 'extracting',
    }).eq('id', clipId);

    // Check for platform subtitles
    const files = await fs.readdir(tmpDir);
    const subFile = files.find(f => f.endsWith('.json3') || f.endsWith('.vtt') || f.endsWith('.srt'));
    const subtitlePath = subFile ? path.join(tmpDir, subFile) : null;

    // ── Stage 2: Extract audio ──
    const wavPath = path.join(tmpDir, `${clipId}.wav`);
    const aacPath = path.join(tmpDir, `${clipId}.aac`);

    await run('ffmpeg', ['-y', '-i', videoPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1', wavPath]);
    await run('ffmpeg', ['-y', '-i', videoPath, '-vn', '-acodec', 'aac', '-b:a', '192k', aacPath]);

    const wavKey = `clips/audio/${clipId}.wav`;
    const aacKey = `clips/audio/${clipId}.aac`;
    await uploadToR2(wavPath, wavKey, 'audio/wav');
    await uploadToR2(aacPath, aacKey, 'audio/aac');

    await supabase.from('clips').update({
      audio_wav_path: wavKey, audio_aac_path: aacKey, pipeline_status: 'analyzing',
    }).eq('id', clipId);

    // ── Stage 3: Analyze ──

    // Beat detection (simple energy-based)
    const beatMap = detectBeats(await fs.readFile(wavPath));
    const beatMapKey = `clips/analysis/${clipId}_beats.json`;
    await uploadJsonToR2(beatMap, beatMapKey);

    // Speech-to-text: try platform subs first, then Whisper
    let speechSegments = [];
    let subtitleSource = null;

    if (subtitlePath) {
      const parsed = parsePlatformSubs(await fs.readFile(subtitlePath, 'utf-8'));
      if (parsed && parsed.length > 0) {
        speechSegments = parsed;
        subtitleSource = 'tiktok_caption';
      }
    }

    if (speechSegments.length === 0 && process.env.OPENAI_API_KEY) {
      const whisperResult = await transcribeWhisper(wavPath);
      if (whisperResult.length > 0) {
        speechSegments = whisperResult;
        subtitleSource = 'speech_to_text';
      }
    }

    const speechKey = `clips/analysis/${clipId}_speech.json`;
    await uploadJsonToR2({ segments: speechSegments }, speechKey);

    // Auto-create full_clip segment
    const subtitleData = speechSegments.length > 0
      ? { cues: speechSegments.map((s, i) => ({ cue_id: i + 1, start_ms: s.start_ms, end_ms: s.end_ms, text: s.text, words: s.words })) }
      : null;

    await supabase.from('clip_segments').insert({
      clip_id: clipId, display_label: 'Full Clip',
      start_ms: 0, end_ms: durationMs, segment_type: 'full_clip',
      subtitle_data: subtitleData, subtitle_source_type: subtitleSource,
      subtitle_verified: false, ordering_index: 0,
    });

    await supabase.from('clips').update({
      beat_map_path: beatMapKey, speech_segments_path: speechKey,
      pipeline_status: 'ready_for_review',
    }).eq('id', clipId);

    console.log(`Pipeline complete for clip ${clipId}`);

  } catch (err) {
    console.error(`Pipeline failed for clip ${clipId}:`, err.message);
    await supabase.from('clips').update({
      pipeline_status: 'failed', pipeline_error: err.message,
    }).eq('id', clipId);
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Beat detection ──

function detectBeats(wavBuffer) {
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const dataOffset = 44;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = (wavBuffer.length - dataOffset) / bytesPerSample;

  const windowSize = Math.round(sampleRate * 0.02);
  const hopSize = Math.round(sampleRate * 0.01);
  const energies = [];

  for (let i = 0; i < numSamples - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      const off = dataOffset + (i + j) * bytesPerSample;
      if (off + 1 < wavBuffer.length) {
        const sample = wavBuffer.readInt16LE(off) / 32768;
        energy += sample * sample;
      }
    }
    energies.push(energy / windowSize);
  }

  const beatTimesMs = [];
  const beatStrengths = [];
  const localWin = 50;
  const minGap = 200;

  for (let i = localWin; i < energies.length - localWin; i++) {
    let avg = 0;
    for (let j = i - localWin; j < i + localWin; j++) avg += energies[j];
    avg /= localWin * 2;
    const threshold = avg * 1.5 + 0.001;
    if (energies[i] > threshold && energies[i] >= energies[i-1] && energies[i] >= energies[i+1]) {
      const timeMs = Math.round((i * hopSize / sampleRate) * 1000);
      if (beatTimesMs.length === 0 || timeMs - beatTimesMs[beatTimesMs.length - 1] >= minGap) {
        beatTimesMs.push(timeMs);
        beatStrengths.push(Math.min(energies[i] / (avg + 0.0001), 5.0));
      }
    }
  }

  let bpm = 120;
  if (beatTimesMs.length > 2) {
    const intervals = [];
    for (let i = 1; i < beatTimesMs.length; i++) intervals.push(beatTimesMs[i] - beatTimesMs[i-1]);
    const median = intervals.sort((a,b) => a-b)[Math.floor(intervals.length/2)];
    if (median > 0) bpm = Math.max(40, Math.min(240, Math.round(60000 / median)));
  }

  return { bpm, beat_times_ms: beatTimesMs, beat_strengths: beatStrengths };
}

// ── Platform subtitle parser ──

function parsePlatformSubs(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data.events || !Array.isArray(data.events)) return null;
    const segments = [];
    for (const event of data.events) {
      if (!event.segs) continue;
      const startMs = event.tStartMs || 0;
      const endMs = startMs + (event.dDurationMs || 0);
      const text = event.segs.map(s => s.utf8 || '').join('').trim();
      if (!text) continue;
      const words = [];
      for (const seg of event.segs) {
        const word = (seg.utf8 || '').trim();
        if (!word) continue;
        const wordStart = startMs + (seg.tOffsetMs || 0);
        words.push({ word, start_ms: wordStart, end_ms: wordStart + 200, confidence: 1.0 });
      }
      segments.push({ start_ms: startMs, end_ms: endMs, text, words });
    }
    return segments.length > 0 ? segments : null;
  } catch { return null; }
}

// ── Whisper transcription ──

async function transcribeWhisper(wavPath) {
  const fileBuffer = await fs.readFile(wavPath);
  const blob = new Blob([fileBuffer], { type: 'audio/wav' });
  const formData = new FormData();
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  if (!res.ok) return [];
  const result = await res.json();
  const segments = [];

  if (result.segments && result.segments.length > 0) {
    const allWords = result.words || [];
    let wi = 0;
    for (const seg of result.segments) {
      const words = [];
      while (wi < allWords.length && allWords[wi].start < seg.end + 0.1) {
        const w = allWords[wi];
        words.push({ word: w.word.trim(), start_ms: Math.round(w.start * 1000), end_ms: Math.round(w.end * 1000), confidence: 1.0 });
        wi++;
      }
      segments.push({ start_ms: Math.round(seg.start * 1000), end_ms: Math.round(seg.end * 1000), text: seg.text.trim(), words });
    }
  } else if (result.words && result.words.length > 0) {
    segments.push({
      start_ms: Math.round(result.words[0].start * 1000),
      end_ms: Math.round(result.words[result.words.length - 1].end * 1000),
      text: result.text.trim(),
      words: result.words.map(w => ({ word: w.word.trim(), start_ms: Math.round(w.start * 1000), end_ms: Math.round(w.end * 1000), confidence: 1.0 })),
    });
  }

  return segments;
}

// ── HTTP Server ──

const server = http.createServer(async (req, res) => {
  // Auth check
  if (WORKER_TOKEN && req.headers['x-worker-token'] !== WORKER_TOKEN) {
    return respond(res, 401, { error: 'Unauthorized' });
  }

  if (req.method === 'GET' && req.url === '/health') {
    return respond(res, 200, { status: 'ok' });
  }

  if (req.method === 'POST' && req.url === '/metadata') {
    return handleMetadata(req, res);
  }

  if (req.method === 'POST' && req.url === '/pipeline') {
    return handlePipeline(req, res);
  }

  respond(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`Worker listening on :${PORT}`));

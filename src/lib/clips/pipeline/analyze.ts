import type { SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { uploadJsonToR2, clipKeys } from './storage';
import { speechToSubtitles } from './subtitles';

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperResponse {
  text: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

interface BeatMap {
  bpm: number;
  beat_times_ms: number[];
  beat_strengths: number[];
}

interface SpeechSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  words: { word: string; start_ms: number; end_ms: number; confidence: number }[];
}

/**
 * Call OpenAI Whisper API to transcribe audio with word-level timestamps.
 */
async function transcribeWithWhisper(wavPath: string): Promise<{ segments: SpeechSegment[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for speech-to-text');
  }

  const fileBuffer = await fs.readFile(wavPath);
  const blob = new Blob([fileBuffer], { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('timestamp_granularities[]', 'segment');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${errorText}`);
  }

  const result: WhisperResponse = await response.json();

  // Build speech segments with word-level timing
  const segments: SpeechSegment[] = [];

  if (result.segments && result.segments.length > 0) {
    // Match words to segments
    const allWords = result.words ?? [];
    let wordIndex = 0;

    for (const seg of result.segments) {
      const segWords: SpeechSegment['words'] = [];

      // Collect words that fall within this segment's time range
      while (wordIndex < allWords.length && allWords[wordIndex].start < seg.end + 0.1) {
        const w = allWords[wordIndex];
        segWords.push({
          word: w.word.trim(),
          start_ms: Math.round(w.start * 1000),
          end_ms: Math.round(w.end * 1000),
          confidence: 1.0, // Whisper API doesn't return per-word confidence
        });
        wordIndex++;
      }

      segments.push({
        start_ms: Math.round(seg.start * 1000),
        end_ms: Math.round(seg.end * 1000),
        text: seg.text.trim(),
        words: segWords,
      });
    }
  } else if (result.words && result.words.length > 0) {
    // No segments, just words — group into one segment
    const words = result.words;
    segments.push({
      start_ms: Math.round(words[0].start * 1000),
      end_ms: Math.round(words[words.length - 1].end * 1000),
      text: result.text.trim(),
      words: words.map((w) => ({
        word: w.word.trim(),
        start_ms: Math.round(w.start * 1000),
        end_ms: Math.round(w.end * 1000),
        confidence: 1.0,
      })),
    });
  }

  return { segments };
}

/**
 * Simple energy-based beat detection from a WAV file.
 * Reads raw PCM samples, computes energy in windows, and finds peaks.
 */
async function detectBeats(wavPath: string): Promise<BeatMap> {
  const buffer = await fs.readFile(wavPath);

  // Parse WAV header (assumes 44-byte header, PCM 16-bit mono 44100 Hz)
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataOffset = 44; // Standard WAV header size
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = (buffer.length - dataOffset) / bytesPerSample;

  // Compute energy in windows
  const windowSize = Math.round(sampleRate * 0.02); // 20ms windows
  const hopSize = Math.round(sampleRate * 0.01);    // 10ms hop
  const energies: number[] = [];

  for (let i = 0; i < numSamples - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      const offset = dataOffset + (i + j) * bytesPerSample;
      if (offset + 1 < buffer.length) {
        const sample = buffer.readInt16LE(offset) / 32768;
        energy += sample * sample;
      }
    }
    energies.push(energy / windowSize);
  }

  // Find peaks using adaptive threshold
  const beatTimesMs: number[] = [];
  const beatStrengths: number[] = [];
  const localWindowSize = 50; // ~500ms context window
  const minBeatGapMs = 200;   // Minimum 200ms between beats

  for (let i = localWindowSize; i < energies.length - localWindowSize; i++) {
    // Compute local average
    let localAvg = 0;
    for (let j = i - localWindowSize; j < i + localWindowSize; j++) {
      localAvg += energies[j];
    }
    localAvg /= (localWindowSize * 2);

    // Peak if energy is significantly above local average
    const threshold = localAvg * 1.5 + 0.001;
    if (energies[i] > threshold && energies[i] >= energies[i - 1] && energies[i] >= energies[i + 1]) {
      const timeMs = Math.round((i * hopSize / sampleRate) * 1000);

      // Enforce minimum gap
      if (beatTimesMs.length === 0 || timeMs - beatTimesMs[beatTimesMs.length - 1] >= minBeatGapMs) {
        beatTimesMs.push(timeMs);
        beatStrengths.push(Math.min(energies[i] / (localAvg + 0.0001), 5.0));
      }
    }
  }

  // Estimate BPM from beat intervals
  let bpm = 120; // default
  if (beatTimesMs.length > 2) {
    const intervals: number[] = [];
    for (let i = 1; i < beatTimesMs.length; i++) {
      intervals.push(beatTimesMs[i] - beatTimesMs[i - 1]);
    }
    const medianInterval = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    if (medianInterval > 0) {
      bpm = Math.round(60000 / medianInterval);
      // Clamp to reasonable range
      if (bpm < 40) bpm = 40;
      if (bpm > 240) bpm = 240;
    }
  }

  return { bpm, beat_times_ms: beatTimesMs, beat_strengths: beatStrengths };
}

/**
 * Try to parse platform subtitles downloaded by yt-dlp (json3 format).
 * Returns speech segments if successful, null if file doesn't exist or can't be parsed.
 */
async function parsePlatformSubtitles(subtitlePath: string): Promise<SpeechSegment[] | null> {
  try {
    const raw = await fs.readFile(subtitlePath, 'utf-8');
    const data = JSON.parse(raw);

    // json3 format has an "events" array with "segs" (segments) containing "utf8" text
    if (!data.events || !Array.isArray(data.events)) return null;

    const segments: SpeechSegment[] = [];

    for (const event of data.events) {
      if (!event.segs || !Array.isArray(event.segs)) continue;

      const startMs = event.tStartMs ?? 0;
      const endMs = startMs + (event.dDurationMs ?? 0);
      const text = event.segs.map((s: { utf8?: string }) => s.utf8 ?? '').join('').trim();

      if (!text) continue;

      // Build word-level timing from segs with tOffsetMs
      const words: SpeechSegment['words'] = [];
      let offset = startMs;
      for (const seg of event.segs) {
        const word = (seg.utf8 ?? '').trim();
        if (!word) continue;
        const wordStart = startMs + (seg.tOffsetMs ?? 0);
        // Estimate word end from next offset or event duration
        words.push({
          word,
          start_ms: wordStart,
          end_ms: wordStart + Math.max(200, Math.round((endMs - startMs) / Math.max(event.segs.length, 1))),
          confidence: 1.0,
        });
      }

      segments.push({ start_ms: startMs, end_ms: endMs, text, words });
    }

    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
}

/**
 * Run audio analysis: beat detection + speech-to-text.
 * Prefers platform subtitles from yt-dlp; falls back to Whisper API if unavailable.
 * Stores results to R2, auto-creates segments, and updates the clip record.
 */
export async function analyzeAudio(
  supabase: SupabaseClient,
  clipId: string,
  wavPath: string,
  platformSubtitlePath?: string | null,
): Promise<void> {
  await supabase
    .from('clips')
    .update({ pipeline_status: 'analyzing', updated_at: new Date().toISOString() })
    .eq('id', clipId);

  // Get clip duration for the full_clip segment
  const { data: clip } = await supabase
    .from('clips')
    .select('duration_ms')
    .eq('id', clipId)
    .single();

  const durationMs = clip?.duration_ms ?? 0;

  // Try platform subtitles first, then Whisper as fallback
  let speechSegments: SpeechSegment[] = [];
  let subtitleSource: 'tiktok_caption' | 'speech_to_text' | null = null;

  if (platformSubtitlePath) {
    const platformSubs = await parsePlatformSubtitles(platformSubtitlePath);
    if (platformSubs && platformSubs.length > 0) {
      speechSegments = platformSubs;
      subtitleSource = 'tiktok_caption';
    }
  }

  // Run beat detection in parallel with Whisper fallback (if needed)
  const beatMapPromise = detectBeats(wavPath);

  if (speechSegments.length === 0) {
    // No platform subtitles — fall back to Whisper
    const whisperResult = await transcribeWithWhisper(wavPath).catch((err) => {
      console.error(`Whisper transcription failed for clip ${clipId}:`, err.message);
      return { segments: [] as SpeechSegment[] };
    });
    speechSegments = whisperResult.segments;
    subtitleSource = speechSegments.length > 0 ? 'speech_to_text' : null;
  }

  const beatMap = await beatMapPromise;
  const speechResult = { segments: speechSegments };

  // Upload analysis results to R2
  const beatMapKey = clipKeys.beatMap(clipId);
  const speechKey = clipKeys.speechSegments(clipId);
  await uploadJsonToR2(beatMap, beatMapKey);
  await uploadJsonToR2(speechResult, speechKey);

  // Auto-create a full_clip segment
  const subtitleData = speechSegments.length > 0
    ? speechToSubtitles(speechSegments)
    : null;

  await supabase.from('clip_segments').insert({
    clip_id: clipId,
    display_label: 'Full Clip',
    start_ms: 0,
    end_ms: durationMs,
    segment_type: 'full_clip',
    subtitle_data: subtitleData,
    subtitle_source_type: subtitleSource,
    subtitle_verified: false,
    ordering_index: 0,
  });

  // Update clip record
  await supabase
    .from('clips')
    .update({
      beat_map_path: beatMapKey,
      speech_segments_path: speechKey,
      pipeline_status: 'ready_for_review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId);
}

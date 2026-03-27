import { buildSyntheticAudioPlan } from './storage';
import type {
  GenerationAssignment,
  GenerationBatchInput,
  GenerationBatchResult,
  GenerationBatchServices,
  GenerationLineInterpretation,
  GenerationLineState,
  GenerationPersistedArtifact,
  GenerationProfile,
  GenerationRunSnapshot,
  GenerationSourceLine,
  GenerationStoragePlan,
  GenerationSynthesisResult,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildDefaultInterpretation(
  line: GenerationSourceLine,
  contextLines: GenerationSourceLine[]
): GenerationLineInterpretation {
  const text = normalizeText(line.ttsText ?? line.chunkText);
  const previousLine = [...contextLines].reverse().find((candidate) => candidate.id !== line.id) ?? null;
  const deliveryNotes: string[] = [];
  const emotionTags = new Set<string>();
  const emphasisNotes: string[] = [];
  const continuityNotes: string[] = [];

  emotionTags.add(line.type === 'dialogue' ? 'speech' : 'performance');

  if (/[!?]$/.test(text)) {
    emotionTags.add('urgent');
    emphasisNotes.push('End with a crisp lift');
  }
  if (text.includes('...')) {
    emotionTags.add('hesitant');
    deliveryNotes.push('Allow a natural pause around the ellipsis');
  }
  if (text === text.toUpperCase() && text.length > 4) {
    emotionTags.add('intense');
    emphasisNotes.push('Treat the line as emphatic');
  }
  if (line.type === 'action') {
    deliveryNotes.push('Keep movement readable and grounded');
  }
  if (line.character) {
    deliveryNotes.push(`Voice the line as ${line.character}`);
  }
  if (previousLine?.character && previousLine.character !== line.character) {
    continuityNotes.push(`Contrast delivery with the previous beat from ${previousLine.character}`);
  }
  if (previousLine?.character === line.character) {
    continuityNotes.push('Preserve continuity from the prior line by the same speaker');
  }

  const pauseBeforeMs = clamp(50 + Math.floor(text.length / 3), 0, 1200);
  const pauseAfterMs = clamp(70 + Math.floor(text.split(/[.!?]/).length * 30), 0, 1500);

  return {
    pauseBeforeMs,
    pauseAfterMs,
    emotionTags: [...emotionTags],
    deliveryNotes,
    continuityNotes,
    emphasisNotes,
    promptSummary: `Plan ${line.type} line for ${line.character ?? 'narration'} with ${contextLines.length} context lines`,
  };
}

function buildDefaultSynthesis(line: GenerationSourceLine): GenerationSynthesisResult {
  return {
    audioBytes: null,
    contentType: 'audio/wav',
    fileExtension: line.type === 'dialogue' ? 'wav' : 'wav',
  };
}

function buildLineState(input: {
  line: GenerationSourceLine;
  aiProfileId: string | null;
  status: GenerationLineState['status'];
  attemptCount: number;
  interpretation: GenerationLineInterpretation | null;
  storagePlan: GenerationStoragePlan | null;
  error: string | null;
}): GenerationLineState {
  return {
    lineId: input.line.id,
    status: input.status,
    attemptCount: input.attemptCount,
    aiProfileId: input.aiProfileId,
    sceneId: input.line.sceneId,
    scriptId: input.line.scriptId,
    chunkIndex: input.line.chunkIndex,
    chunkInScene: input.line.chunkInScene,
    interpretation: input.interpretation,
    storagePlan: input.storagePlan,
    error: input.error,
    updatedAt: nowIso(),
  };
}

function shouldProcessLine(
  line: GenerationSourceLine,
  resumeState: GenerationRunSnapshot | null | undefined,
  retryFailedLines: boolean
): boolean {
  if (line.isSystem) return false;
  const previous = resumeState?.lineStates[line.id];
  if (!previous) return true;
  if (previous.status === 'persisted') return false;
  if (previous.status === 'failed' && !retryFailedLines) return false;
  return true;
}

function resolveProfileForLine(
  line: GenerationSourceLine,
  profiles: GenerationProfile[],
  assignments: GenerationAssignment[],
  defaultAiProfileId?: string | null
): GenerationProfile | null {
  const assignedProfileId = line.character
    ? assignments.find((assignment) => assignment.character === line.character)?.aiProfileId ?? null
    : null;

  const candidateId = assignedProfileId ?? defaultAiProfileId ?? profiles[0]?.aiProfileId ?? null;
  if (!candidateId) return null;
  return profiles.find((profile) => profile.aiProfileId === candidateId) ?? null;
}

function sliceContext(lines: GenerationSourceLine[], index: number, windowSize: number): GenerationSourceLine[] {
  const start = Math.max(0, index - windowSize);
  const end = Math.min(lines.length, index + windowSize + 1);
  return lines.slice(start, end);
}

export async function runGenerationBatch(
  input: GenerationBatchInput,
  services: GenerationBatchServices = {}
): Promise<GenerationBatchResult> {
  const startedAt = nowIso();
  const sortedLines = [...input.sourceLines]
    .filter((line) => line.scriptId === input.scriptId)
    .sort((a, b) => a.chunkIndex - b.chunkIndex || a.chunkInScene - b.chunkInScene);
  const retryFailedLines = input.retryFailedLines ?? true;
  const contextWindowSize = input.contextWindowSize ?? 2;
  const lineStates: Record<string, GenerationLineState> = {};
  const persistedArtifacts: GenerationPersistedArtifact[] = [];
  const eligibleLineIds: string[] = [];
  const skippedSystemLineIds: string[] = [];

  for (let index = 0; index < sortedLines.length; index += 1) {
    const line = sortedLines[index];
    if (line.isSystem) {
      skippedSystemLineIds.push(line.id);
      continue;
    }

    eligibleLineIds.push(line.id);
    const previous = input.resume?.lineStates[line.id];
    const canProcess = shouldProcessLine(line, input.resume, retryFailedLines);
    if (!canProcess && previous) {
      lineStates[line.id] = previous;
      continue;
    }

    const profile = resolveProfileForLine(line, input.profiles, input.assignments, input.defaultAiProfileId);
    if (!profile) {
      lineStates[line.id] = buildLineState({
        line,
        aiProfileId: null,
        status: 'failed',
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        interpretation: null,
        storagePlan: null,
        error: 'No AI profile could be resolved for this line',
      });
      continue;
    }

    try {
      const contextLines = sliceContext(sortedLines, index, contextWindowSize);
      const interpretation =
        (await services.interpretLine?.({
          runId: input.runId,
          line,
          profile,
          contextLines,
        })) ?? buildDefaultInterpretation(line, contextLines);

      lineStates[line.id] = buildLineState({
        line,
        aiProfileId: profile.aiProfileId,
        status: 'interpreted',
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        interpretation,
        storagePlan: null,
        error: null,
      });

      const synthesis =
        (await services.synthesizeLine?.({
          runId: input.runId,
          line,
          profile,
          interpretation,
        })) ?? buildDefaultSynthesis(line);

      const storagePlan = buildSyntheticAudioPlan({
        runId: input.runId,
        scriptId: input.scriptId,
        aiProfileId: profile.aiProfileId,
        lineId: line.id,
        contentType: synthesis.contentType,
        fileExtension: synthesis.fileExtension,
      });

      lineStates[line.id] = buildLineState({
        line,
        aiProfileId: profile.aiProfileId,
        status: 'synthesized',
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        interpretation,
        storagePlan,
        error: null,
      });

      const persistedArtifact = await services.persistArtifact?.({
        runId: input.runId,
        scriptId: input.scriptId,
        line,
        profile,
        interpretation,
        synthesis,
        storagePlan,
      });

      if (persistedArtifact) {
        persistedArtifacts.push(persistedArtifact);
        lineStates[line.id] = buildLineState({
          line,
          aiProfileId: profile.aiProfileId,
          status: 'persisted',
          attemptCount: (previous?.attemptCount ?? 0) + 1,
          interpretation,
          storagePlan,
          error: null,
        });
      }
    } catch (error) {
      lineStates[line.id] = buildLineState({
        line,
        aiProfileId: profile.aiProfileId,
        status: 'failed',
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        interpretation: previous?.interpretation ?? null,
        storagePlan: previous?.storagePlan ?? null,
        error: error instanceof Error ? error.message : 'Generation failed',
      });
    }
  }

  return {
    runId: input.runId,
    scriptId: input.scriptId,
    startedAt,
    finishedAt: nowIso(),
    eligibleLineIds,
    skippedSystemLineIds,
    lineStates,
    persistedArtifacts,
  };
}

export function serializeGenerationSnapshot(result: GenerationBatchResult): GenerationRunSnapshot {
  return {
    runId: result.runId,
    lineStates: result.lineStates,
  };
}

export function countGenerationStatuses(states: Record<string, GenerationLineState>): Record<GenerationLineState['status'], number> {
  const counts: Record<GenerationLineState['status'], number> = {
    pending: 0,
    interpreted: 0,
    synthesized: 0,
    persisted: 0,
    failed: 0,
  };

  for (const state of Object.values(states)) {
    counts[state.status] += 1;
  }

  return counts;
}

export type GenerationLineStatus = 'pending' | 'interpreted' | 'synthesized' | 'persisted' | 'failed';

export interface GenerationSourceLine {
  id: string;
  scriptId: string;
  sceneId: string;
  chunkIndex: number;
  chunkInScene: number;
  type: 'scene_heading' | 'action' | 'dialogue' | 'transition';
  character: string | null;
  ttsText: string | null;
  chunkText: string;
  isSystem: boolean;
}

export interface GenerationProfile {
  aiProfileId: string;
  displayName: string;
  voicePersonaId: string | null;
  platform: 'Grok';
}

export interface GenerationAssignment {
  character: string;
  aiProfileId: string;
}

export interface GenerationLineInterpretation {
  pauseBeforeMs: number;
  pauseAfterMs: number;
  emotionTags: string[];
  deliveryNotes: string[];
  continuityNotes: string[];
  emphasisNotes: string[];
  promptSummary: string;
}

export interface GenerationSynthesisResult {
  audioBytes: Uint8Array | null;
  contentType: string;
  fileExtension: string;
}

export interface GenerationStoragePlan {
  storageKey: string;
  contentType: string;
  fileExtension: string;
}

export interface GenerationLineState {
  lineId: string;
  status: GenerationLineStatus;
  attemptCount: number;
  aiProfileId: string | null;
  sceneId: string;
  scriptId: string;
  chunkIndex: number;
  chunkInScene: number;
  interpretation: GenerationLineInterpretation | null;
  storagePlan: GenerationStoragePlan | null;
  error: string | null;
  updatedAt: string;
}

export interface GenerationRunSnapshot {
  runId: string;
  lineStates: Record<string, GenerationLineState>;
}

export interface GenerationPersistRequest {
  runId: string;
  scriptId: string;
  line: GenerationSourceLine;
  profile: GenerationProfile;
  interpretation: GenerationLineInterpretation;
  synthesis: GenerationSynthesisResult;
  storagePlan: GenerationStoragePlan;
}

export interface GenerationPersistedArtifact extends GenerationStoragePlan {
  runId: string;
  scriptId: string;
  lineId: string;
  aiProfileId: string;
  byteLength: number | null;
  persistedAt: string;
}

export interface GenerationBatchInput {
  runId: string;
  scriptId: string;
  sourceLines: GenerationSourceLine[];
  profiles: GenerationProfile[];
  assignments: GenerationAssignment[];
  defaultAiProfileId?: string | null;
  resume?: GenerationRunSnapshot | null;
  retryFailedLines?: boolean;
  contextWindowSize?: number;
}

export interface GenerationBatchServices {
  interpretLine?: (request: {
    runId: string;
    line: GenerationSourceLine;
    profile: GenerationProfile;
    contextLines: GenerationSourceLine[];
  }) => Promise<GenerationLineInterpretation> | GenerationLineInterpretation;
  synthesizeLine?: (request: {
    runId: string;
    line: GenerationSourceLine;
    profile: GenerationProfile;
    interpretation: GenerationLineInterpretation;
  }) => Promise<GenerationSynthesisResult> | GenerationSynthesisResult;
  persistArtifact?: (
    request: GenerationPersistRequest
  ) => Promise<GenerationPersistedArtifact | null> | GenerationPersistedArtifact | null;
}

export interface GenerationBatchResult {
  runId: string;
  scriptId: string;
  startedAt: string;
  finishedAt: string;
  eligibleLineIds: string[];
  skippedSystemLineIds: string[];
  lineStates: Record<string, GenerationLineState>;
  persistedArtifacts: GenerationPersistedArtifact[];
}

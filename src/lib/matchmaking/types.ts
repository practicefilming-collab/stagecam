/** Type definitions for the matchmaking pipeline. */
import type { Scene, AssignedChunk } from '../types';

export interface MatchmakingContext {
  roomId: string;
  scriptId: string;
  selectionMode: 'auto' | 'pick';
  selectedActId: string | null;
  selectedSceneId: string | null;
  participantIds: string[];
  participantNames: Map<string, string>;
}

export interface MatchmakingResult {
  sceneId: string;
  sceneHeading: string | null;
  sceneNumber: number;
  actNumber: number;
  totalChunks: number;
  systemChunks: number;
  assignments: ParticipantAssignment[];
}

export interface ParticipantAssignment {
  userId: string;
  displayName: string;
  character: string | null;
  chunks: AssignedChunk[];
  dialogueCount: number;
  actionCount: number;
}

export interface ScoredScene {
  scene: Scene & { character_stats?: CharacterStat[] };
  actNumber: number;
  coverageRatio: number;
  recordingCount: number;
  characterCount: number;
  dialogueChunkCount: number;
}

export interface CharacterStat {
  name: string;
  dialogue_chunks: number;
  total_chunks: number;
}

export interface CharacterProfile {
  name: string;
  dialogueChunkCount: number;
  chunkIds: string[];
}

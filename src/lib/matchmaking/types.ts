/** Type definitions for the matchmaking pipeline. */
import type { Scene, AssignedLine } from '../types';

export interface MatchmakingContext {
  roomId: string;
  scriptId: string;
  selectionMode: 'auto' | 'pick';
  selectedActId: string | null;
  selectedSceneId: string | null;
  participantIds: string[];
  participantNames: Map<string, string>;
  roleDraft?: Record<string, string[]>;  // userId → character names claimed
}

export interface MatchmakingResult {
  sceneId: string;
  sceneHeading: string | null;
  sceneNumber: number;
  actNumber: number;
  totalLines: number;
  systemLines: number;
  assignments: ParticipantAssignment[];
  characters: { name: string; dialogueCount: number }[];
}

export interface ParticipantAssignment {
  userId: string;
  displayName: string;
  character: string | null;
  lines: AssignedLine[];
  dialogueCount: number;
  actionCount: number;
}

export interface ScoredScene {
  scene: Scene;
  actNumber: number;
  coverageRatio: number;
  recordingCount: number;
  characterCount: number;
  dialogueLineCount: number;
}

export interface CharacterProfile {
  name: string;
  dialogueLineCount: number;
  lineIds: string[];
}

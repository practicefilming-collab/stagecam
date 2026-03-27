import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '@/lib/r2';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import type { GenerationPersistedArtifact, GenerationStoragePlan } from './types';

export interface SyntheticAudioPayload {
  bytes: Uint8Array;
  contentType: string;
  fileExtension: string;
}

export function buildSyntheticAudioStorageKey(input: {
  runId: string;
  scriptId: string;
  aiProfileId: string;
  lineId: string;
  fileExtension: string;
}): string {
  const safeExtension = input.fileExtension.replace(/^\./, '') || 'wav';
  return `generation/${input.scriptId}/${input.runId}/${input.aiProfileId}/${input.lineId}.${safeExtension}`;
}

export function buildSyntheticAudioPlan(input: {
  runId: string;
  scriptId: string;
  aiProfileId: string;
  lineId: string;
  contentType?: string;
  fileExtension?: string;
}): GenerationStoragePlan {
  const fileExtension = input.fileExtension ?? 'wav';
  return {
    storageKey: buildSyntheticAudioStorageKey({
      runId: input.runId,
      scriptId: input.scriptId,
      aiProfileId: input.aiProfileId,
      lineId: input.lineId,
      fileExtension,
    }),
    contentType: input.contentType ?? 'audio/wav',
    fileExtension,
  };
}

export async function normalizeAudioBytes(
  raw: string | Uint8Array | ArrayBuffer | Buffer | null | undefined
): Promise<Uint8Array | null> {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return new Uint8Array(raw);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return new Uint8Array(Buffer.from(trimmed, 'base64'));
  }
  return null;
}

export async function persistSyntheticAudioToR2(input: {
  plan: GenerationStoragePlan;
  payload: SyntheticAudioPayload;
}): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: input.plan.storageKey,
      Body: Buffer.from(input.payload.bytes),
      ContentType: input.payload.contentType,
    })
  );
}

export async function persistSyntheticAudioArtifact(input: {
  plan: GenerationStoragePlan;
  payload: SyntheticAudioPayload;
  runId: string;
  scriptId: string;
  lineId: string;
  aiProfileId: string;
}): Promise<GenerationPersistedArtifact> {
  await persistSyntheticAudioToR2({
    plan: input.plan,
    payload: input.payload,
  });

  return {
    ...input.plan,
    runId: input.runId,
    scriptId: input.scriptId,
    lineId: input.lineId,
    aiProfileId: input.aiProfileId,
    byteLength: input.payload.bytes.byteLength,
    persistedAt: new Date().toISOString(),
  };
}

export function createSyntheticArtifactFromPlan(
  plan: GenerationStoragePlan,
  meta: {
    runId: string;
    scriptId: string;
    lineId: string;
    aiProfileId: string;
    byteLength?: number | null;
  }
): GenerationPersistedArtifact {
  return {
    ...plan,
    runId: meta.runId,
    scriptId: meta.scriptId,
    lineId: meta.lineId,
    aiProfileId: meta.aiProfileId,
    byteLength: meta.byteLength ?? null,
    persistedAt: new Date().toISOString(),
  };
}

export function makeDetachedStoragePlan(input: {
  runId: string;
  scriptId: string;
  lineId: string;
  aiProfileId: string;
  contentType?: string;
  fileExtension?: string;
}): GenerationStoragePlan {
  return buildSyntheticAudioPlan({
    ...input,
    fileExtension: input.fileExtension ?? 'wav',
  });
}

export function generateSyntheticArtifactId(): string {
  return randomUUID();
}

export async function readFileBytes(filePath: string): Promise<Uint8Array> {
  const buffer = await fs.readFile(filePath);
  return new Uint8Array(buffer);
}

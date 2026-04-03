import { r2, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';

/** Upload a local file to R2 and return the storage key. */
export async function uploadToR2(
  localPath: string,
  key: string,
  contentType: string,
): Promise<string> {
  const body = createReadStream(localPath);
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/** Upload a JSON object to R2 as a file. */
export async function uploadJsonToR2(
  data: unknown,
  key: string,
): Promise<string> {
  const body = JSON.stringify(data, null, 2);
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }),
  );
  return key;
}

/** Get a presigned URL for downloading a file from R2. */
export async function getPresignedUrl(key: string, expiresIn = 600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2, cmd, { expiresIn });
}

/** R2 key builders for clip assets. */
export const clipKeys = {
  video: (clipId: string) => `clips/videos/${clipId}.mp4`,
  audioWav: (clipId: string) => `clips/audio/${clipId}.wav`,
  audioAac: (clipId: string) => `clips/audio/${clipId}.aac`,
  beatMap: (clipId: string) => `clips/analysis/${clipId}_beats.json`,
  speechSegments: (clipId: string) => `clips/analysis/${clipId}_speech.json`,
};

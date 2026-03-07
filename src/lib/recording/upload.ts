import { createClient } from '../supabase/client';
import { STORAGE_BUCKETS } from '../constants';

export async function uploadRecording(
  blob: Blob,
  scriptId: string,
  chunkId: string,
  userId: string
): Promise<string | null> {
  const supabase = createClient();
  const timestamp = Date.now();
  const path = `${scriptId}/${chunkId}/${userId}_${timestamp}.webm`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.RECORDINGS)
    .upload(path, blob, {
      contentType: 'video/webm',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  return path;
}

export function getRecordingUrl(path: string): string {
  const supabase = createClient();
  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.RECORDINGS)
    .getPublicUrl(path);
  return data.publicUrl;
}

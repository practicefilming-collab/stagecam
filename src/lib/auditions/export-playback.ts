import type { ScenePlaybackData } from '@/lib/player/build-scene-playback';
import { buildAuditionTakePlaybackData } from './build-take-playback';

export async function buildAuditionTakeExportPlayback(takeId: string): Promise<ScenePlaybackData | null> {
  const playback = await buildAuditionTakePlaybackData(takeId);
  if (!playback) return null;

  return {
    scene: {
      id: playback.scene.id,
      sceneNumber: playback.scene.orderIndex + 1,
      sceneHeading: playback.scene.label,
      actNumber: 0,
      scriptTitle: playback.script.title,
      scriptYear: 0,
    },
    items: playback.items,
    stats: playback.stats,
  };
}

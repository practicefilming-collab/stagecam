import * as fs from 'fs';
import matter from 'gray-matter';
import type { ParsedChunk } from '../../src/lib/types';

export function parseChunkedScript(filePath: string): ParsedChunk[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const chunks: ParsedChunk[] = [];

  // Split by --- delimiters (YAML frontmatter blocks)
  const sections = content.split(/\n---\n/);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    // Try to parse as YAML frontmatter + content
    try {
      const parsed = matter(`---\n${section}\n---`);
      const data = parsed.data;

      if (!data.script || !data.chunk_index) continue;

      chunks.push({
        script: data.script,
        rank: data.rank,
        year: data.year,
        act: data.act,
        scene: data.scene,
        scene_heading: data.scene_heading ?? '',
        chunk_index: data.chunk_index,
        chunk_in_scene: data.chunk_in_scene,
        type: data.type ?? 'action',
        character: data.character,
        content: parsed.content.trim(),
      });
    } catch {
      // Skip unparseable sections
    }
  }

  return chunks;
}

export function extractTtsText(chunkText: string, type: string): string {
  // For dialogue, the content IS the tts text
  // For action/transition, same
  // For scene_heading, we keep it as-is
  return chunkText;
}

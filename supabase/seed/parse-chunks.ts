import * as fs from 'fs';
import matter from 'gray-matter';
import type { ParsedChunk } from '../../src/lib/types';

export function parseChunkedScript(filePath: string): ParsedChunk[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const content = raw.replace(/\r\n/g, '\n'); // normalize Windows line endings
  const chunks: ParsedChunk[] = [];

  // Match each frontmatter block: ---\nyaml\n---\ncontent
  const blockRegex = /---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\n|$)/g;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    try {
      const parsed = matter(`---\n${match[1]}\n---\n${match[2]}`);
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
  void type;
  // For dialogue, the content IS the tts text
  // For action/transition, same
  // For scene_heading, we keep it as-is
  return chunkText;
}

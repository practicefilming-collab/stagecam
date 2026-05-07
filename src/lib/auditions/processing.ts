import type { SupabaseClient } from '@supabase/supabase-js';
import { computeRollCalls } from '@/lib/matchmaking/roll-call';
import type { AuditionScript, Script } from '@/lib/types';
import { extractZipEntry } from './zip';

type PreviewBlock =
  | { kind: 'action'; text: string; isSystem: boolean }
  | { kind: 'dialogue'; speaker: string; text: string };

export interface AuditionProcessingRoleBrief {
  roleName: string;
  voiceId: string;
  voiceLabel: string;
  rationale: string;
  defaultTone: string;
  defaultPacing: string;
  relationshipStance: string;
  emphasisGuidance: string;
}

export interface AuditionProcessingScenePreview {
  orderIndex: number;
  scenarioNumber: number;
  heading: string;
  label: string;
  sourcePageRef: string;
  sceneText: string;
  roleNames: string[];
  sceneObjective: string;
  dramaticPurpose: string;
  emotionalTemperature: string;
  subtext: string;
  rehearsalEmphasis: string;
  blocks: PreviewBlock[];
  ambiguityNotes: string[];
}

export interface AuditionProcessingPreview {
  auditionId: string;
  title: string;
  sourceLabel: string;
  originalFilename: string;
  extractedText: string;
  roleNames: string[];
  scenes: AuditionProcessingScenePreview[];
  roleBriefs: AuditionProcessingRoleBrief[];
  cleanupLog: string[];
  ambiguityLog: string[];
  internalScript: {
    title: string;
    slug: string;
  };
}

export interface AuditionProcessingStoredConfig {
  roleNames: string[];
  scenes: Array<Pick<
    AuditionProcessingScenePreview,
    | 'orderIndex'
    | 'scenarioNumber'
    | 'heading'
    | 'label'
    | 'sourcePageRef'
    | 'sceneText'
    | 'roleNames'
    | 'sceneObjective'
    | 'dramaticPurpose'
    | 'emotionalTemperature'
    | 'subtext'
    | 'rehearsalEmphasis'
  >>;
  roleBriefs: AuditionProcessingRoleBrief[];
  cleanupLog: string[];
  ambiguityLog: string[];
  internalScript: {
    title: string;
    slug: string;
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeCopy(value: string): string {
  return value
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/Â·/g, '·')
    .replace(/Â/g, '')
    .replace(/\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"');
}

function cleanDialogueForTts(value: string): string {
  return normalizeWhitespace(value.replace(/\([^)]*\)/g, ' ').replace(/\s+([,.;!?])/g, '$1'));
}

function isSystemAction(value: string): boolean {
  const text = normalizeWhitespace(value).toUpperCase();
  if (!text) return true;
  if (text.length <= 18) return true;
  return /^(SCENE OPENS|SCENE OPENSBOTH|SCENE ENDS|SCRIPT|THEME:|WHAT TO WEAR|HAIR AND MAKEUP|THIS MEANS:|PLEASE AVOID:)/.test(text);
}

function parseDocxParagraphs(buffer: Buffer): string[] {
  const documentXml = extractZipEntry(buffer, 'word/document.xml').toString('utf8');
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];

  return paragraphs
    .map((paragraph) => {
      const withBreaks = paragraph
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br(?:\s+[^>]*)?\/>/g, '\n');
      const matches = [...withBreaks.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
      return normalizeCopy(decodeXmlEntities(matches.map((match) => match[1]).join('')).trim());
    })
    .filter(Boolean);
}

function parsePlainText(buffer: Buffer): string {
  return normalizeCopy(buffer.toString('utf8').replace(/\r\n/g, '\n'));
}

function extractSourceText(buffer: Buffer, script: AuditionScript): string {
  const lowerName = script.original_filename.toLowerCase();
  if (
    script.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    try {
      return parseDocxParagraphs(buffer).join('\n');
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Could not read DOCX source: ${error.message}`
          : 'Could not read DOCX source.',
      );
    }
  }
  if (script.mime_type === 'text/plain' || lowerName.endsWith('.txt')) {
    return parsePlainText(buffer);
  }
  throw new Error('Automatic processing currently supports DOCX and TXT audition files.');
}

function stableRoleName(value: string): string {
  const normalized = normalizeWhitespace(value.replace(/\s+/g, ' '));
  if (/^line manager$/i.test(normalized)) return 'LINE MANAGER';
  if (/^employee$/i.test(normalized)) return 'Employee';
  return normalized;
}

function analyzeSceneFocus(heading: string) {
  const lower = heading.toLowerCase();
  const isBad = lower.includes('bad conversation');
  const isManager = lower.includes('line manager');

  if (isManager && isBad) {
    return {
      sceneObjective: 'Show how poor leadership and divided attention flatten the conversation.',
      dramaticPurpose: 'Demonstrate what not to do when a manager owns the meeting but fails to lead it.',
      emotionalTemperature: 'Tense, rushed, deflating.',
      subtext: 'The employee arrived ready to engage, but the manager signals that growth is not important.',
      rehearsalEmphasis: 'Prioritize interruption timing, distracted energy, and the employee’s deflation without melodrama.',
    };
  }
  if (isManager) {
    return {
      sceneObjective: 'Model a manager creating clarity, confidence, and next-step momentum.',
      dramaticPurpose: 'Show the line manager as prepared, attentive, and practically useful.',
      emotionalTemperature: 'Calm, supportive, forward-looking.',
      subtext: 'The employee is already doing well; the manager’s job is to unlock direction and confidence.',
      rehearsalEmphasis: 'Keep the manager grounded and intentional, with space for the employee to feel heard.',
    };
  }
  if (isBad) {
    return {
      sceneObjective: 'Show an employee who wants advancement without preparation or ownership.',
      dramaticPurpose: 'Demonstrate how vagueness and passivity weaken a career conversation.',
      emotionalTemperature: 'Uneven, defensive, underpowered.',
      subtext: 'The employee wants validation more than a plan, forcing the manager to carry the conversation.',
      rehearsalEmphasis: 'Keep the employee’s evasiveness readable while the manager stays professional rather than harsh.',
    };
  }

  return {
    sceneObjective: 'Show an employee leading their own development conversation with maturity and clarity.',
    dramaticPurpose: 'Demonstrate shared ownership, realistic ambition, and practical next steps.',
    emotionalTemperature: 'Confident, collaborative, optimistic.',
    subtext: 'The employee is ready for more responsibility and wants help calibrating the path, not rescuing it.',
    rehearsalEmphasis: 'Play thoughtful preparation and momentum, not polished perfection.',
  };
}

function buildRoleBriefs(): AuditionProcessingRoleBrief[] {
  return [
    {
      roleName: 'LINE MANAGER',
      voiceId: 'sal',
      voiceLabel: 'Sal',
      rationale: 'Grounded and authoritative without feeling theatrical, which fits coaching, correction, and executive calm.',
      defaultTone: 'Direct, composed, attentive.',
      defaultPacing: 'Measured with deliberate pauses when guiding or correcting.',
      relationshipStance: 'Responsible for framing the conversation and holding the structure.',
      emphasisGuidance: 'Land practical guidance cleanly; avoid sounding generic or corporate-scripted.',
    },
    {
      roleName: 'Employee',
      voiceId: 'eve',
      voiceLabel: 'Eve',
      rationale: 'Clear, open, and emotionally legible, which supports both vulnerable and proactive beats.',
      defaultTone: 'Earnest, responsive, thoughtful.',
      defaultPacing: 'Natural conversational pacing with slight lifts on uncertainty or initiative.',
      relationshipStance: 'Brings personal stakes and reveals whether the conversation is motivating or draining.',
      emphasisGuidance: 'Keep motivation and hesitation specific so the growth arc stays believable.',
    },
  ];
}

function buildStoredConfig(preview: AuditionProcessingPreview): AuditionProcessingStoredConfig {
  return {
    roleNames: preview.roleNames,
    scenes: preview.scenes.map((scene) => ({
      orderIndex: scene.orderIndex,
      scenarioNumber: scene.scenarioNumber,
      heading: scene.heading,
      label: scene.label,
      sourcePageRef: scene.sourcePageRef,
      sceneText: scene.sceneText,
      roleNames: scene.roleNames,
      sceneObjective: scene.sceneObjective,
      dramaticPurpose: scene.dramaticPurpose,
      emotionalTemperature: scene.emotionalTemperature,
      subtext: scene.subtext,
      rehearsalEmphasis: scene.rehearsalEmphasis,
    })),
    roleBriefs: preview.roleBriefs,
    cleanupLog: preview.cleanupLog,
    ambiguityLog: preview.ambiguityLog,
    internalScript: preview.internalScript,
  };
}

export function hydratePreviewFromStoredConfig(input: {
  auditionId: string;
  title: string;
  sourceLabel: string;
  originalFilename: string;
  storedConfig: AuditionProcessingStoredConfig;
}): AuditionProcessingPreview {
  return {
    auditionId: input.auditionId,
    title: input.title,
    sourceLabel: input.sourceLabel,
    originalFilename: input.originalFilename,
    extractedText: '',
    roleNames: input.storedConfig.roleNames,
    scenes: input.storedConfig.scenes.map((scene) => ({
      ...scene,
      blocks: [],
      ambiguityNotes: [],
    })),
    roleBriefs: input.storedConfig.roleBriefs,
    cleanupLog: input.storedConfig.cleanupLog,
    ambiguityLog: input.storedConfig.ambiguityLog,
    internalScript: input.storedConfig.internalScript,
  };
}

export function sanitizeAuditionProcessingPreview(preview: AuditionProcessingPreview): AuditionProcessingPreview {
  return {
    ...preview,
    roleNames: [...new Set(preview.roleNames.map((roleName) => normalizeWhitespace(normalizeCopy(roleName))).filter(Boolean))],
    roleBriefs: preview.roleBriefs.map((brief) => ({
      ...brief,
      roleName: normalizeWhitespace(normalizeCopy(brief.roleName)),
      voiceId: normalizeWhitespace(brief.voiceId),
      voiceLabel: normalizeWhitespace(normalizeCopy(brief.voiceLabel)),
      rationale: normalizeCopy(brief.rationale).trim(),
      defaultTone: normalizeCopy(brief.defaultTone).trim(),
      defaultPacing: normalizeCopy(brief.defaultPacing).trim(),
      relationshipStance: normalizeCopy(brief.relationshipStance).trim(),
      emphasisGuidance: normalizeCopy(brief.emphasisGuidance).trim(),
    })),
    scenes: preview.scenes.map((scene, index) => ({
      ...scene,
      orderIndex: index + 1,
      label: normalizeWhitespace(normalizeCopy(scene.label)) || `Scenario ${scene.scenarioNumber}`,
      sourcePageRef: normalizeWhitespace(normalizeCopy(scene.sourcePageRef)) || `Scenario ${scene.scenarioNumber}`,
      sceneText: normalizeCopy(scene.sceneText).trim(),
      roleNames: [...new Set(scene.roleNames.map((roleName) => normalizeWhitespace(normalizeCopy(roleName))).filter(Boolean))],
      sceneObjective: normalizeCopy(scene.sceneObjective).trim(),
      dramaticPurpose: normalizeCopy(scene.dramaticPurpose).trim(),
      emotionalTemperature: normalizeCopy(scene.emotionalTemperature).trim(),
      subtext: normalizeCopy(scene.subtext).trim(),
      rehearsalEmphasis: normalizeCopy(scene.rehearsalEmphasis).trim(),
    })),
  };
}

function buildSceneText(blocks: PreviewBlock[]): string {
  return blocks
    .map((block) =>
      block.kind === 'dialogue'
        ? `${block.speaker}: ${block.text}`
        : block.text,
    )
    .join('\n\n');
}

function parseSceneBlocks(lines: string[], cleanupLog: string[], ambiguityLog: string[]): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^script$/i.test(line)) {
      cleanupLog.push('Dropped standalone "Script" marker from parsed scene body.');
      continue;
    }

    const speakerMatch = line.match(/^(LINE MANAGER|Employee):\s*(.*)$/i);
    if (speakerMatch) {
      const speaker = stableRoleName(speakerMatch[1]);
      const text = normalizeWhitespace(speakerMatch[2]);
      if (!text) {
        ambiguityLog.push(`Encountered empty dialogue line for ${speaker}.`);
        continue;
      }

      blocks.push({ kind: 'dialogue', speaker, text });
      continue;
    }

    const looksLikeAction =
      /^\(/.test(line) ||
      /^scene /i.test(line) ||
      /^theme:/i.test(line) ||
      /^demonstrating /i.test(line);

    if (
      blocks.length > 0 &&
      blocks[blocks.length - 1].kind === 'dialogue' &&
      !/^[A-Z][A-Z\s]+:/.test(line) &&
      !looksLikeAction
    ) {
      const previous = blocks[blocks.length - 1] as Extract<PreviewBlock, { kind: 'dialogue' }>;
      previous.text = normalizeWhitespace(`${previous.text} ${line}`);
      continue;
    }

    blocks.push({
      kind: 'action',
      text: normalizeWhitespace(line),
      isSystem: isSystemAction(line),
    });
  }

  return blocks;
}

function buildPreviewFromText(script: AuditionScript, extractedText: string): AuditionProcessingPreview {
  const lines = extractedText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const scenarioIndexes = lines
    .map((line, index) => (/^SCENARIO\s+\d+:/i.test(line) ? index : -1))
    .filter((index) => index >= 0);

  if (scenarioIndexes.length === 0) {
    throw new Error('No scenario headings were found in the uploaded audition.');
  }

  const cleanupLog: string[] = [];
  const ambiguityLog: string[] = [];
  const scenes: AuditionProcessingScenePreview[] = [];

  for (let index = 0; index < scenarioIndexes.length; index += 1) {
    const start = scenarioIndexes[index];
    const end = scenarioIndexes[index + 1] ?? lines.length;
    const sectionLines = lines.slice(start, end);
    const heading = sectionLines[0];
    const scenarioNumber = Number((heading.match(/^SCENARIO\s+(\d+)/i) ?? [])[1] ?? index + 1);
    const label = normalizeWhitespace(heading.split(':').slice(1).join(':')) || `Scenario ${scenarioNumber}`;
    const bodyLines = sectionLines.slice(1);
    const blocks = parseSceneBlocks(bodyLines, cleanupLog, ambiguityLog);
    const roleNames = [...new Set(blocks.flatMap((block) => (block.kind === 'dialogue' ? [block.speaker] : [])))];
    const sceneNotes = analyzeSceneFocus(heading);

    scenes.push({
      orderIndex: index + 1,
      scenarioNumber,
      heading,
      label,
      sourcePageRef: `Scenario ${scenarioNumber}`,
      sceneText: buildSceneText(blocks),
      roleNames,
      blocks,
      ambiguityNotes: [],
      ...sceneNotes,
    });
  }

  return {
    auditionId: script.id,
    title: script.title,
    sourceLabel: script.source_label,
    originalFilename: script.original_filename,
    extractedText,
    roleNames: ['LINE MANAGER', 'Employee'],
    scenes,
    roleBriefs: buildRoleBriefs(),
    cleanupLog,
    ambiguityLog,
    internalScript: {
      title: `${script.title} (Audition Internal)`,
      slug: `audition-${slugify(script.title)}-${script.id.slice(0, 8)}`,
    },
  };
}

export async function buildAuditionProcessingPreview(input: {
  admin: SupabaseClient;
  script: AuditionScript;
}): Promise<AuditionProcessingPreview> {
  const { data, error } = await input.admin.storage.from('audition-scripts').download(input.script.storage_key);
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to download audition source file.');
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const extractedText = extractSourceText(buffer, input.script);
  return buildPreviewFromText(input.script, extractedText);
}

function chunkDialogueText(block: Extract<PreviewBlock, { kind: 'dialogue' }>) {
  return {
    chunk_text: `${block.speaker}: ${block.text}`,
    tts_text: cleanDialogueForTts(block.text),
    character: block.speaker,
    type: 'dialogue' as const,
    is_system: false,
  };
}

function chunkActionText(block: Extract<PreviewBlock, { kind: 'action' }>) {
  return {
    chunk_text: block.text,
    tts_text: block.text,
    character: null,
    type: 'action' as const,
    is_system: block.isSystem,
  };
}

async function upsertHiddenScript(input: {
  admin: SupabaseClient;
  audition: AuditionScript;
  preview: AuditionProcessingPreview;
}): Promise<Script> {
  const { data: existing } = await input.admin
    .from('scripts')
    .select('*')
    .eq('source_audition_script_id', input.audition.id)
    .maybeSingle();

  const baseScript = {
    title: input.preview.internalScript.title,
    slug: input.preview.internalScript.slug,
    rank: null,
    year: null,
    total_acts: 1,
    total_scenes: input.preview.scenes.length,
    total_chunks: 0,
    storage_prefix: `audition/${input.audition.id}`,
    is_internal: true,
    source_audition_script_id: input.audition.id,
    processing_metadata: {
      source: 'audition_processing',
      sourceLabel: input.audition.source_label,
      roleNames: input.preview.roleNames,
      cleanupLog: input.preview.cleanupLog,
      ambiguityLog: input.preview.ambiguityLog,
    },
  };

  const script = existing
    ? (
        await input.admin
          .from('scripts')
          .update(baseScript)
          .eq('id', existing.id)
          .select('*')
          .single()
      ).data
    : (
        await input.admin
          .from('scripts')
          .insert(baseScript)
          .select('*')
          .single()
      ).data;

  if (!script) {
    throw new Error('Failed to create or update internal shared script.');
  }

  await input.admin.from('acts').delete().eq('script_id', script.id);

  const totalChunkCount = input.preview.scenes.reduce((sum, scene) => sum + scene.blocks.length + 1, 0);
  await input.admin
    .from('scripts')
    .update({ total_chunks: totalChunkCount })
    .eq('id', script.id);

  const { data: act, error: actError } = await input.admin
    .from('acts')
    .insert({
      script_id: script.id,
      act_number: 1,
      total_scenes: input.preview.scenes.length,
      total_chunks: totalChunkCount,
    })
    .select('*')
    .single();

  if (actError || !act) {
    throw new Error(actError?.message ?? 'Failed to create internal script act.');
  }

  let chunkIndex = 1;

  for (const scenePreview of input.preview.scenes) {
    const uniqueCharacters = scenePreview.roleNames;
    const dialogueCounts = new Map<string, { dialogue_chunks: number; total_chunks: number }>();
    let rehearsableChunks = 0;
    let actionChunkCount = 0;

    for (const block of scenePreview.blocks) {
      if (block.kind === 'dialogue') {
        rehearsableChunks += 1;
        const current = dialogueCounts.get(block.speaker) ?? { dialogue_chunks: 0, total_chunks: 0 };
        current.dialogue_chunks += 1;
        current.total_chunks += 1;
        dialogueCounts.set(block.speaker, current);
      } else if (!block.isSystem) {
        rehearsableChunks += 1;
        actionChunkCount += 1;
      }
    }

    const characterStats = [...dialogueCounts.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.dialogue_chunks - a.dialogue_chunks);

    const { data: scene, error: sceneError } = await input.admin
      .from('scenes')
      .insert({
        act_id: act.id,
        scene_number: scenePreview.orderIndex,
        scene_heading: scenePreview.heading,
        total_chunks: scenePreview.blocks.length + 1,
        unique_characters: uniqueCharacters,
        character_stats: characterStats,
        rehearsable_chunks: rehearsableChunks,
        roll_calls: computeRollCalls(uniqueCharacters.length, actionChunkCount),
        processing_metadata: {
          auditionId: input.audition.id,
          sceneObjective: scenePreview.sceneObjective,
          dramaticPurpose: scenePreview.dramaticPurpose,
          emotionalTemperature: scenePreview.emotionalTemperature,
          subtext: scenePreview.subtext,
          rehearsalEmphasis: scenePreview.rehearsalEmphasis,
          label: scenePreview.label,
        },
      })
      .select('*')
      .single();

    if (sceneError || !scene) {
      throw new Error(sceneError?.message ?? `Failed to create scene ${scenePreview.label}.`);
    }

    const chunkRows: Array<{
      scene_id: string;
      chunk_index: number;
      chunk_in_scene: number;
      type: 'scene_heading' | 'action' | 'dialogue' | 'transition';
      character: string | null;
      tts_text: string;
      chunk_text: string;
      is_system: boolean;
    }> = [
      {
        scene_id: scene.id,
        chunk_index: chunkIndex,
        chunk_in_scene: 1,
        type: 'scene_heading',
        character: null,
        tts_text: scenePreview.heading,
        chunk_text: scenePreview.heading,
        is_system: true,
      },
    ];
    chunkIndex += 1;

    let chunkInScene = 2;
    for (const block of scenePreview.blocks) {
      chunkRows.push({
        scene_id: scene.id,
        chunk_index: chunkIndex,
        chunk_in_scene: chunkInScene,
        ...(block.kind === 'dialogue' ? chunkDialogueText(block) : chunkActionText(block)),
      });
      chunkIndex += 1;
      chunkInScene += 1;
    }

    const { error: chunkError } = await input.admin.from('chunks').insert(chunkRows);
    if (chunkError) {
      throw new Error(chunkError.message);
    }
  }

  return script as Script;
}

export async function ensureAuditionAiProfiles(input: {
  admin: SupabaseClient;
  scriptId: string;
  roleBriefs: AuditionProcessingRoleBrief[];
}): Promise<void> {
  const { data: existingProfiles } = await input.admin
    .from('ai_profiles')
    .select('id, display_name')
    .eq('script_id', input.scriptId);

  const existingByName = new Map(
    (existingProfiles ?? []).map((profile) => [String(profile.display_name), String(profile.id)]),
  );
  const desiredNames = new Set(input.roleBriefs.map((roleBrief) => roleBrief.roleName));

  for (const roleBrief of input.roleBriefs) {
    const payload = {
      script_id: input.scriptId,
      display_name: roleBrief.roleName,
      status: 'active',
      platform: 'Grok',
      voice_persona_id: roleBrief.voiceId,
      voice_persona_label: roleBrief.voiceLabel,
      metadata: {
        roleBrief,
      },
    };

    const existingId = existingByName.get(roleBrief.roleName) ?? null;
    if (existingId) {
      await input.admin.from('ai_profiles').update(payload).eq('id', existingId);
    } else {
      await input.admin.from('ai_profiles').insert(payload);
    }
  }

  const staleProfileIds = (existingProfiles ?? [])
    .filter((profile) => !desiredNames.has(String(profile.display_name)))
    .map((profile) => String(profile.id));

  if (staleProfileIds.length > 0) {
    await input.admin
      .from('ai_profiles')
      .update({ status: 'archived' })
      .in('id', staleProfileIds);
  }
}

export async function applyAuditionProcessingPreview(input: {
  admin: SupabaseClient;
  audition: AuditionScript;
  preview: AuditionProcessingPreview;
  processorUserId: string;
}): Promise<{ linkedScript: Script }> {
  await input.admin.from('audition_scenes').delete().eq('audition_script_id', input.audition.id);

  for (const scene of input.preview.scenes) {
    const { data: insertedScene, error: sceneError } = await input.admin
      .from('audition_scenes')
      .insert({
        audition_script_id: input.audition.id,
        label: scene.label,
        order_index: scene.orderIndex,
        source_page_ref: scene.sourcePageRef,
        scene_text: scene.sceneText,
      })
      .select('*')
      .single();

    if (sceneError || !insertedScene) {
      throw new Error(sceneError?.message ?? `Failed to create audition scene ${scene.label}.`);
    }

    const roleRows = scene.roleNames.map((roleName, index) => ({
      audition_scene_id: insertedScene.id,
      name: roleName,
      order_index: index + 1,
      is_active: true,
    }));
    const { error: roleError } = await input.admin.from('audition_roles').insert(roleRows);
    if (roleError) {
      throw new Error(roleError.message);
    }
  }

  const linkedScript = await upsertHiddenScript(input);

  await input.admin
    .from('audition_scripts')
    .update({
      status: 'ready',
      processed_by_admin_id: input.processorUserId,
      processed_at: new Date().toISOString(),
      processing_notes: {
        appliedConfig: buildStoredConfig(input.preview),
        cleanupLog: input.preview.cleanupLog,
        ambiguityLog: input.preview.ambiguityLog,
        linkedScriptId: linkedScript.id,
      },
    })
    .eq('id', input.audition.id);

  return { linkedScript };
}

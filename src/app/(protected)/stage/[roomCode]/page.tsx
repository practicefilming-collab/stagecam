'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatPlatformUsername } from '@/lib/auth/identity';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/hooks/use-presence';
import {
  getCharacterDialogueLines,
  getMaxCharacterDialogueLines,
  getSceneRehearsableLines,
  getScriptTotalLines,
  summarizeCharacterDialogueLines,
} from '@/lib/line-helpers';
import type { Room, Script, Act, Scene, RoomPresence, PublicIdentityPlatform, RollCallEntry } from '@/lib/types';

interface CallSheetEntry {
  userId: string;
  displayName: string;
  totalLines: number;
  character: string | null;
  dialogueLines: number;
  actionLines: number;
  lines: { line_id: string; role: string; character?: string }[];
}

interface SceneCharacter {
  name: string;
  dialogueLines: number;
}

interface BrowseRole {
  name: string;
  lineCount: number;
}

interface PreviewData {
  mode: 'pick';
  sceneId: string;
  sceneHeading: string;
  sceneNumber: number;
  actNumber: number;
  totalLines: number;
  systemLines: number;
  callSheet: CallSheetEntry[];
  characters: SceneCharacter[];
}

interface RoleClaim {
  userId: string;
  displayName: string;
}

interface SceneLineBreakdown {
  rehearsableLines: number;
  dialogueLines: number;
  narrationLines: number;
}

type Stage = 'script' | 'scene' | 'callsheet';

function getIdentityIcon(platform: PublicIdentityPlatform | null) {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.4" cy="6.7" r="1.1" fill="currentColor" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
          <path
            d="M14.3 3c.3 2.3 1.7 4 4.2 4.4v2.9c-1.5 0-2.9-.4-4.2-1.3v6.2a5.2 5.2 0 1 1-5.2-5.2c.4 0 .8 0 1.2.1v3a2.5 2.5 0 1 0 1.1 2.1V3h2.9Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'incognito':
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
          <path
            d="M6.5 10.8 8.3 6h7.4l1.8 4.8M4 18.2c1.6-2.3 3.4-3.4 5.4-3.4 1.8 0 3.1.9 4.6 2.2 1.2-1.2 2.8-2.2 4.9-2.2 1.4 0 2.8.5 4.1 1.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9.2" cy="17.2" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.8" cy="17.2" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

function getPresenceIdentityLabel(participant: RoomPresence) {
  if (participant.publicIdentityPlatform === 'instagram' || participant.publicIdentityPlatform === 'tiktok') {
    return formatPlatformUsername(participant.publicIdentityUsername) ?? participant.displayName;
  }

  return 'Incognito';
}

function getRollCallEntryForParticipants(
  scene: Scene,
  participantCount: number
): RollCallEntry | undefined {
  const rollCalls = scene.roll_calls as RollCallEntry[] | undefined;
  if (!rollCalls || participantCount < 1) return undefined;

  if (participantCount < 7) {
    return rollCalls.find((entry) => entry.participants === participantCount);
  }

  return rollCalls
    .filter((entry) => entry.participants >= participantCount)
    .sort((a, b) => a.narrators - b.narrators)[0];
}

export default function BackstagePage() {
  const params = useParams();
  const roomCode = params.roomCode as string;
  const router = useRouter();
  const supabase = createClient();

  const [room, setRoom] = useState<Room | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState<string>('Unknown');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Script selection
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);

  // Scene selection
  const [acts, setActs] = useState<Act[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneLineBreakdowns, setSceneLineBreakdowns] = useState<Record<string, SceneLineBreakdown>>({});
  const [sceneLineBreakdownsLoaded, setSceneLineBreakdownsLoaded] = useState(false);
  const [mode, setMode] = useState<'auto' | 'pick'>('auto');
  const [pickMode, setPickMode] = useState<'length' | 'character' | 'group-size' | 'act-scene'>('length');
  const [selectedActId, setSelectedActId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [selectedGroupSize, setSelectedGroupSize] = useState<number | null>(null);
  const [selectedLengthTier, setSelectedLengthTier] = useState<'spark' | 'beat' | 'moment' | null>(null);

  // Call sheet
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Role draft state
  const [roleClaims, setRoleClaims] = useState<Map<string, RoleClaim>>(new Map());
  const [wantsNarrator, setWantsNarrator] = useState(false);

  // Ready state
  const [readyUsers, setReadyUsers] = useState<Set<string>>(new Set());
  const [isReady, setIsReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // Current stage for creator flow
  const [stage, setStage] = useState<Stage>('script');

  const { presenceState } = usePresence(roomCode);
  const participants = Object.values(presenceState).flat() as unknown as RoomPresence[];

  // Derived: my claimed roles
  const myRoles = preview?.characters.filter(
    (c) => roleClaims.get(c.name)?.userId === currentUserId
  ) ?? [];
  const isNarratorOnly = (preview?.characters.length ?? 0) === 0;
  const isSoloNarrator = participants.length === 1 && isNarratorOnly;
  const hasRole = myRoles.length > 0 || wantsNarrator || isSoloNarrator;

  // Derived: narration line count
  const narrationCount = preview
    ? preview.totalLines - preview.characters.reduce((s, c) => s + c.dialogueLines, 0)
    : 0;

  // Auto-claim sole character for solo users
  useEffect(() => {
    if (
      preview &&
      participants.length === 1 &&
      preview.characters.length === 1 &&
      roleClaims.size === 0 &&
      !isReady
    ) {
      claimRole(preview.characters[0].name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, participants.length]);

  const loadScriptDetails = useCallback(async (scriptId: string) => {
    setSceneLineBreakdownsLoaded(false);

    const { data: actsData } = await supabase
      .from('acts')
      .select('*')
      .eq('script_id', scriptId)
      .order('act_number');
    setActs(actsData ?? []);

    if (actsData && actsData.length > 0) {
      const actIds = actsData.map((a) => a.id);
      const { data: scenesData } = await supabase
        .from('scenes')
        .select('*')
        .in('act_id', actIds)
        .order('scene_number');
      const nextScenes = scenesData ?? [];
      setScenes(nextScenes);

      const sceneIds = nextScenes.map((scene) => scene.id);
      if (sceneIds.length === 0) {
        setSceneLineBreakdowns({});
        setSceneLineBreakdownsLoaded(true);
        return;
      }

      const { data: chunkRows } = await supabase
        .from('chunks')
        .select('scene_id, type, character, is_system')
        .in('scene_id', sceneIds);

      const breakdowns: Record<string, SceneLineBreakdown> = {};
      for (const scene of nextScenes) {
        breakdowns[scene.id] = {
          rehearsableLines: 0,
          dialogueLines: 0,
          narrationLines: 0,
        };
      }

      for (const chunk of chunkRows ?? []) {
        const breakdown = breakdowns[chunk.scene_id];
        if (!breakdown || chunk.is_system) continue;

        breakdown.rehearsableLines += 1;

        if (chunk.type === 'dialogue' && chunk.character) {
          breakdown.dialogueLines += 1;
        } else {
          breakdown.narrationLines += 1;
        }
      }

      setSceneLineBreakdowns(breakdowns);
      setSceneLineBreakdownsLoaded(true);
    } else {
      setScenes([]);
      setSceneLineBreakdowns({});
      setSceneLineBreakdownsLoaded(true);
    }
  }, [supabase]);

  // Load room data
  useEffect(() => {
    async function loadRoom() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      setCurrentDisplayName(profile?.display_name ?? 'Unknown');

      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single();

      if (!roomData) {
        router.push('/menu');
        return;
      }

      setRoom(roomData);
      setIsCreator(roomData.creator_id === user.id);

      // If room already has a script, skip script selection
      if (roomData.script_id) {
        setSelectedScriptId(roomData.script_id);
        setStage('scene');
        await loadScriptDetails(roomData.script_id);
      }

      // Join as participant
      await supabase.from('room_participants').upsert({
        room_id: roomData.id,
        user_id: user.id,
        is_creator: roomData.creator_id === user.id,
      }, { onConflict: 'room_id,user_id' });

      setLoading(false);

      if (roomData.status === 'active') {
        router.push(`/stage/${roomCode}/rehearse`);
      }
    }
    void loadRoom();
  }, [loadScriptDetails, roomCode, router, supabase]);

  // Load available scripts
  useEffect(() => {
    async function loadScripts() {
      const { data } = await supabase
        .from('scripts')
        .select('*')
        .order('rank', { ascending: true });
      setScripts(data ?? []);
    }
    void loadScripts();
  }, [supabase]);

  // Listen for room status changes + ready broadcasts + role claims
  useEffect(() => {
    const channel = supabase
      .channel(`room-status:${roomCode}`)
      .on('broadcast', { event: 'room_status' }, (payload) => {
        if (payload.payload.status === 'active') {
          router.push(`/stage/${roomCode}/rehearse`);
        }
      })
      .on('broadcast', { event: 'room_config' }, (payload) => {
        // Non-creators receive config updates from creator
        if (payload.payload.stage) setStage(payload.payload.stage);
        if (payload.payload.preview) setPreview(payload.payload.preview);
        if (payload.payload.scriptId) setSelectedScriptId(payload.payload.scriptId);
      })
      .on('broadcast', { event: 'user_ready' }, (payload) => {
        setReadyUsers((prev) => new Set([...prev, payload.payload.userId]));
      })
      .on('broadcast', { event: 'user_unready' }, (payload) => {
        setReadyUsers((prev) => {
          const next = new Set(prev);
          next.delete(payload.payload.userId);
          return next;
        });
      })
      .on('broadcast', { event: 'role_claim' }, (payload) => {
        const { characterName, userId, displayName, action } = payload.payload;
        setRoleClaims((prev) => {
          const next = new Map(prev);
          if (action === 'claim') {
            next.set(characterName, { userId, displayName });
          } else if (action === 'release') {
            // Release all roles held by this user
            for (const [name, claim] of next) {
              if (claim.userId === userId) {
                next.delete(name);
              }
            }
          }
          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, router, supabase]);

  const selectScript = async (scriptId: string) => {
    if (!room) return;
    setSelectedScriptId(scriptId);

    // Update room with selected script
    await fetch(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId }),
    });

    await loadScriptDetails(scriptId);
    setStage('scene');

    // Broadcast config to other participants
    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'room_config',
      payload: { stage: 'scene', scriptId },
    });
  };

  const confirmScene = async () => {
    if (!room) return;
    setPreviewLoading(true);
    setError('');

    // Update room with scene/mode selection
    await fetch(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selection_mode: mode,
        selected_act_id: selectedActId,
        selected_scene_id: selectedSceneId,
      }),
    });

    // Get preview / call sheet
    const res = await fetch(`/api/rooms/${room.id}/preview`);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to generate call sheet');
      setPreviewLoading(false);
      return;
    }

    const data = await res.json();
    setPreview(data);
    setStage('callsheet');
    setPreviewLoading(false);

    // Reset role draft state
    setRoleClaims(new Map());
    setWantsNarrator(false);
    setIsReady(false);
    setReadyUsers(new Set());

    // Broadcast to other participants
    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'room_config',
      payload: { stage: 'callsheet', preview: data },
    });
  };

  const claimRole = async (characterName: string) => {
    if (!currentUserId || isReady) return;

    setRoleClaims((prev) => {
      const next = new Map(prev);
      next.set(characterName, { userId: currentUserId, displayName: currentDisplayName });
      return next;
    });

    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'role_claim',
      payload: { characterName, userId: currentUserId, displayName: currentDisplayName, action: 'claim' },
    });
  };

  const releaseMyRole = async (characterName: string) => {
    if (!currentUserId || isReady) return;

    setRoleClaims((prev) => {
      const next = new Map(prev);
      next.delete(characterName);
      return next;
    });

    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'role_claim',
      payload: { characterName, userId: currentUserId, displayName: currentDisplayName, action: 'release_one' },
    });
  };

  const markReady = async () => {
    if (!currentUserId) return;

    setIsReady(true);
    setReadyUsers((prev) => new Set([...prev, currentUserId]));

    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'user_ready',
      payload: { userId: currentUserId },
    });
  };

  const unready = async () => {
    if (!currentUserId) return;

    // Release all my roles
    setRoleClaims((prev) => {
      const next = new Map(prev);
      for (const [name, claim] of next) {
        if (claim.userId === currentUserId) {
          next.delete(name);
        }
      }
      return next;
    });
    setWantsNarrator(false);
    setIsReady(false);
    setReadyUsers((prev) => {
      const next = new Set(prev);
      next.delete(currentUserId);
      return next;
    });

    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'role_claim',
      payload: { characterName: null, userId: currentUserId, displayName: currentDisplayName, action: 'release' },
    });
    await channel.send({
      type: 'broadcast',
      event: 'user_unready',
      payload: { userId: currentUserId },
    });
  };

  const startSession = async () => {
    if (!room) return;
    setStarting(true);
    setError('');

    // Build roleDraft from current claims
    const draft: Record<string, string[]> = {};
    for (const [characterName, claim] of roleClaims) {
      if (!draft[claim.userId]) draft[claim.userId] = [];
      draft[claim.userId].push(characterName);
    }

    const res = await fetch(`/api/rooms/${room.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleDraft: draft }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to start session');
      setStarting(false);
      return;
    }

    const channel = supabase.channel(`room-status:${roomCode}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status: 'active' },
    });

    router.push(`/stage/${roomCode}/rehearse`);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [confirmLeave, setConfirmLeave] = useState(false);

  const leaveRoom = async () => {
    if (isCreator && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }

    // Release any claimed roles
    if (currentUserId && myRoles.length > 0) {
      const channel = supabase.channel(`room-status:${roomCode}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'role_claim',
        payload: { characterName: null, userId: currentUserId, displayName: currentDisplayName, action: 'release' },
      });
    }

    // Remove participant record
    if (room && currentUserId) {
      await supabase
        .from('room_participants')
        .delete()
        .eq('room_id', room.id)
        .eq('user_id', currentUserId);
    }

    router.push('/menu');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading room...</p>
      </div>
    );
  }

  const selectedScript = scripts.find((s) => s.id === selectedScriptId);

  // Filter out empty placeholder scenes (no heading and no rehearsable content)
  const isEmptyScene = (s: Scene) => {
    const rehearsable = sceneLineBreakdowns[s.id]?.rehearsableLines ?? getSceneRehearsableLines(s);
    return !s.scene_heading && rehearsable === 0;
  };

  const filteredScenes = (selectedActId
    ? scenes.filter((s) => s.act_id === selectedActId)
    : scenes
  ).filter((s) => !isEmptyScene(s));

  const getSceneDialogueLines = (scene: Scene, charStats = scene.character_stats ?? []) =>
    charStats.reduce((sum, stat) => sum + stat.dialogue_chunks, 0);

  const getSceneNarrationLines = (scene: Scene) => {
    const breakdown = sceneLineBreakdowns[scene.id];
    if (breakdown) return breakdown.narrationLines;

    const rehearsableLines = getSceneRehearsableLines(scene);
    return Math.max(0, rehearsableLines - getSceneDialogueLines(scene));
  };

  const getSelectedRoleLines = (scene: Scene, roleName: string) =>
    roleName === 'Narrator'
      ? getSceneNarrationLines(scene)
      : getCharacterDialogueLines(scene.character_stats, roleName);

  const browseRoleMap = new Map<string, number>();
  for (const scene of scenes) {
    for (const stat of scene.character_stats ?? []) {
      browseRoleMap.set(stat.name, (browseRoleMap.get(stat.name) ?? 0) + stat.dialogue_chunks);
    }

    const narrationLines = getSceneNarrationLines(scene);
    if (narrationLines > 0) {
      browseRoleMap.set('Narrator', (browseRoleMap.get('Narrator') ?? 0) + narrationLines);
    }
  }

  const browseRoles: BrowseRole[] = [...browseRoleMap.entries()]
    .map(([name, lineCount]) => ({ name, lineCount }))
    .sort((a, b) => b.lineCount - a.lineCount || a.name.localeCompare(b.name));

  // Filtered scenes for each pick sub-mode
  const getPickScenes = (): Scene[] => {
    if (pickMode === 'act-scene') return filteredScenes;

    // Wait for accurate line data before showing filtered results
    if (!sceneLineBreakdownsLoaded) return [];

    // All non-act-scene sub-modes also exclude empty placeholders
    const validScenes = scenes.filter((s) => !isEmptyScene(s));

    if (pickMode === 'character' && selectedCharacter) {
      return validScenes
        .filter((s) => getSelectedRoleLines(s, selectedCharacter) > 0)
        .sort((a, b) => {
          const aLines = getSelectedRoleLines(a, selectedCharacter);
          const bLines = getSelectedRoleLines(b, selectedCharacter);
          if (bLines !== aLines) return bLines - aLines;

          const aTotal = sceneLineBreakdowns[a.id]?.rehearsableLines ?? getSceneRehearsableLines(a);
          const bTotal = sceneLineBreakdowns[b.id]?.rehearsableLines ?? getSceneRehearsableLines(b);
          return bTotal - aTotal;
        });
    }

    if (pickMode === 'group-size' && selectedGroupSize !== null) {
      const findEntry = (rollCalls: import('@/lib/types').RollCallEntry[] | undefined) => {
        if (!rollCalls) return undefined;
        if (selectedGroupSize < 7) return rollCalls.find((e) => e.participants === selectedGroupSize);
        // 7+ matches any roll call with participants >= 7
        return rollCalls.filter((e) => e.participants >= 7).sort((a, b) => a.narrators - b.narrators)[0];
      };
      return validScenes
        .filter((s) => {
          const rollCalls = s.roll_calls as import('@/lib/types').RollCallEntry[] | undefined;
          return !!findEntry(rollCalls);
        })
        .sort((a, b) => {
          const aEntry = findEntry(a.roll_calls as import('@/lib/types').RollCallEntry[] | undefined);
          const bEntry = findEntry(b.roll_calls as import('@/lib/types').RollCallEntry[] | undefined);
          return (aEntry?.narrators ?? 99) - (bEntry?.narrators ?? 99);
        });
    }

    if (pickMode === 'length' && selectedLengthTier) {
      const thresholds = {
        spark: { maxDialoguePerChar: 2, maxRehearsable: 6 },
        beat: { maxDialoguePerChar: 5, maxRehearsable: 15 },
        moment: { maxDialoguePerChar: 12, maxRehearsable: 30 },
      };
      const t = thresholds[selectedLengthTier];
      return validScenes.filter((s) => {
        const maxDialogue = getMaxCharacterDialogueLines(s.character_stats);
        const rehearsableLines = sceneLineBreakdowns[s.id]?.rehearsableLines ?? getSceneRehearsableLines(s);
        return maxDialogue <= t.maxDialoguePerChar && rehearsableLines <= t.maxRehearsable;
      });
    }

    return [];
  };

  const pickScenes = mode === 'pick' ? getPickScenes() : [];

  // Separate characters into my roles, claimed by others, and available
  const availableRoles = preview?.characters.filter((c) => !roleClaims.has(c.name)) ?? [];
  const othersClaims = preview?.characters.filter(
    (c) => {
      const claim = roleClaims.get(c.name);
      return claim && claim.userId !== currentUserId;
    }
  ) ?? [];

  // Count unclaimed roles for the start warning
  const unclaimedCount = availableRoles.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 spotlight min-h-[calc(100vh-3.5rem)]">
      {/* Room Code Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gold mb-2">Backstage</h1>
        <div className="mb-4">
          <button
            onClick={copyCode}
            className="text-3xl font-mono font-bold tracking-[0.3em] text-gold hover:text-gold-dim transition-colors"
          >
            {roomCode}
          </button>
          <p className="text-xs text-muted mt-1">
            {copied ? 'Copied!' : 'Click to copy'}
          </p>
        </div>
        {selectedScript && (
          <p className="text-muted text-sm">{selectedScript.title} ({selectedScript.year})</p>
        )}
      </div>

      {/* Participants */}
      <div className="bg-surface border border-border rounded-2xl p-4 mb-6">
        <h2 className="text-xs text-muted mb-3 uppercase tracking-wider">
          Cast ({participants.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                stage === 'callsheet' && readyUsers.has(p.userId) ? 'bg-green-500' : 'bg-gold/50'
              }`} />
              <span className="inline-flex items-center gap-1.5">
                {getIdentityIcon(p.publicIdentityPlatform)}
                <span>{getPresenceIdentityLabel(p)}</span>
              </span>
              {p.userId === currentUserId && (
                <span className="text-muted text-xs ml-1">(you)</span>
              )}
            </div>
          ))}
          {participants.length === 0 && (
            <p className="text-muted text-sm">Waiting for participants...</p>
          )}
        </div>
      </div>

      {/* Creator Flow — Script & Scene Selection */}
      {isCreator ? (
        <>
          {/* Stage 1: Script Selection */}
          {stage === 'script' && (
            <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
              <h2 className="text-sm text-muted mb-4 uppercase tracking-wider">Select a Script</h2>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {scripts.map((script) => (
                  <button
                    key={script.id}
                    onClick={() => selectScript(script.id)}
                    className="w-full text-left p-4 rounded-xl border transition-all border-border bg-background/50 hover:border-gold/30 hover:bg-gold/5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-muted mr-2">#{script.rank}</span>
                        <span className="font-medium">{script.title}</span>
                        <span className="text-muted text-sm ml-2">({script.year})</span>
                      </div>
                      <span className="text-xs text-muted">{getScriptTotalLines(script)} lines</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stage 2: Scene Selection */}
          {stage === 'scene' && (
            <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm text-muted uppercase tracking-wider">Scene Selection</h2>
                <button
                  onClick={() => { setStage('script'); setSelectedScriptId(null); }}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Change Script
                </button>
              </div>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setMode('auto')}
                  className={`p-3 rounded-lg border text-left text-sm transition-all ${
                    mode === 'auto'
                      ? 'border-gold bg-gold/5 text-gold'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  <div className="font-medium">Auto</div>
                  <p className="text-xs text-muted mt-0.5">System picks best scene</p>
                </button>
                <button
                  onClick={() => setMode('pick')}
                  className={`p-3 rounded-lg border text-left text-sm transition-all ${
                    mode === 'pick'
                      ? 'border-gold bg-gold/5 text-gold'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  <div className="font-medium">Pick</div>
                  <p className="text-xs text-muted mt-0.5">Choose a specific scene</p>
                </button>
              </div>

              {/* Pick mode: sub-mode pills + content */}
              {mode === 'pick' && (
                <>
                  {/* Sub-mode pills */}
                  <div className="flex gap-2 mb-4 overflow-x-auto">
                    {([
                      ['length', 'Length'],
                      ['character', 'Character'],
                      ['group-size', 'Group Size'],
                      ['act-scene', 'Act/Scene'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => { setPickMode(key); setSelectedSceneId(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs border whitespace-nowrap transition-colors ${
                          pickMode === key
                            ? 'border-gold text-gold bg-gold/10'
                            : 'border-border text-muted hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* By Act/Scene */}
                  {pickMode === 'act-scene' && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        onClick={() => { setSelectedActId(null); setSelectedSceneId(null); }}
                        className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                          !selectedActId ? 'border-gold text-gold bg-gold/10' : 'border-border text-muted hover:text-foreground'
                        }`}
                      >
                        All Acts
                      </button>
                      {acts.map((act) => (
                        <button
                          key={act.id}
                          onClick={() => { setSelectedActId(act.id); setSelectedSceneId(null); }}
                          className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                            selectedActId === act.id ? 'border-gold text-gold bg-gold/10' : 'border-border text-muted hover:text-foreground'
                          }`}
                        >
                          Act {act.act_number}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* By Character */}
                  {pickMode === 'character' && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {browseRoles.map((role) => (
                        <button
                          key={role.name}
                          onClick={() => { setSelectedCharacter(role.name); setSelectedSceneId(null); }}
                          className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                            selectedCharacter === role.name
                              ? 'border-gold text-gold bg-gold/10'
                              : 'border-border text-muted hover:text-foreground'
                          }`}
                        >
                          {role.name} <span className="text-[10px] opacity-70">{role.lineCount}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* By Group Size */}
                  {pickMode === 'group-size' && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[2, 3, 4, 5, 6, 7].map((n) => (
                        <button
                          key={n}
                          onClick={() => { setSelectedGroupSize(n); setSelectedSceneId(null); }}
                          className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                            selectedGroupSize === n
                              ? 'border-gold text-gold bg-gold/10'
                              : 'border-border text-muted hover:text-foreground'
                          }`}
                        >
                          {n === 7 ? '7+' : n}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* By Length */}
                  {pickMode === 'length' && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {([
                        ['spark', 'Spark', '1–2 lines, ~30s'],
                        ['beat', 'Beat', 'A few lines, ~1m'],
                        ['moment', 'Moment', 'Short scene, ~2–3m'],
                      ] as const).map(([key, label, subtitle]) => (
                        <button
                          key={key}
                          onClick={() => { setSelectedLengthTier(key); setSelectedSceneId(null); }}
                          className={`p-2 rounded-lg border text-center transition-colors ${
                            selectedLengthTier === key
                              ? 'border-gold text-gold bg-gold/10'
                              : 'border-border text-muted hover:text-foreground'
                          }`}
                        >
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-muted mt-0.5">{subtitle}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Scene list */}
                  <div className="max-h-72 overflow-y-auto space-y-1 mb-4">
                    {pickScenes.length === 0 && (
                      <p className="text-muted text-sm text-center py-4">
                        {!sceneLineBreakdownsLoaded && pickMode !== 'act-scene' ? 'Loading scenes...' :
                         pickMode === 'character' && !selectedCharacter ? 'Select a character above' :
                         pickMode === 'group-size' && selectedGroupSize === null ? 'Select a group size above' :
                         pickMode === 'length' && !selectedLengthTier ? 'Select a length above' :
                         'No scenes match'}
                      </p>
                    )}
                    {pickScenes.map((scene) => {
                      const charStats = scene.character_stats ?? [];
                      const charCount = scene.unique_characters.length;
                      const breakdown = sceneLineBreakdowns[scene.id];
                      const dialogueLines = breakdown?.dialogueLines ?? charStats.reduce((sum, stat) => sum + stat.dialogue_chunks, 0);
                      const rehearsableLines = breakdown?.rehearsableLines ?? getSceneRehearsableLines(scene);
                      const narrationLines = breakdown?.narrationLines ?? Math.max(0, rehearsableLines - dialogueLines);
                      const selectedRoleLines = selectedCharacter ? getSelectedRoleLines(scene, selectedCharacter) : 0;
                      const breakdownParts = [
                        dialogueLines > 0 ? `${dialogueLines} dialogue` : null,
                        narrationLines > 0 ? `${narrationLines} narration` : null,
                      ].filter(Boolean);
                      return (
                        <button
                          key={scene.id}
                          onClick={() => {
                            setSelectedSceneId(scene.id);
                            setSelectedActId(scene.act_id);
                          }}
                          className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                            selectedSceneId === scene.id
                              ? 'bg-gold/10 border border-gold'
                              : 'bg-background/50 border border-transparent hover:border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-muted text-xs mr-2">Scene {scene.scene_number}</span>
                              <span className="text-foreground">{scene.scene_heading || 'Untitled'}</span>
                            </div>
                            <span className="text-muted text-xs ml-2">
                              {rehearsableLines} {rehearsableLines === 1 ? 'line' : 'lines'}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted">
                            {breakdownParts.length > 0 ? breakdownParts.join(' + ') : '0 rehearsable lines'}
                          </div>

                          {/* Context row varies by sub-mode */}
                          <div className="mt-1 text-xs text-gold/70">
                            {pickMode === 'character' && selectedCharacter && (
                              <>
                                {selectedRoleLines} line{selectedRoleLines !== 1 ? 's' : ''} for {selectedCharacter}
                                {charCount > 0 && (
                                  <span className="text-muted ml-2">· {charCount} character{charCount !== 1 ? 's' : ''}</span>
                                )}
                                {narrationLines > 0 && selectedCharacter !== 'Narrator' && (
                                  <span className="text-muted ml-2">· {narrationLines} narrator line{narrationLines !== 1 ? 's' : ''}</span>
                                )}
                              </>
                            )}
                            {pickMode === 'group-size' && selectedGroupSize !== null && (() => {
                              const rollCalls = scene.roll_calls as import('@/lib/types').RollCallEntry[] | undefined;
                              const entry = selectedGroupSize < 7
                                ? rollCalls?.find((e) => e.participants === selectedGroupSize)
                                : rollCalls?.filter((e) => e.participants >= 7).sort((a, b) => a.narrators - b.narrators)[0];
                              return entry ? (
                                <>
                                  {entry.characters} speaking
                                  {entry.narrators > 0 ? (
                                    <> · {entry.narrators} narrator{entry.narrators !== 1 ? 's' : ''}</>
                                  ) : (
                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold/20 text-gold border border-gold/30">
                                      perfect fit
                                    </span>
                                  )}
                                </>
                              ) : null;
                            })()}
                            {pickMode === 'length' && (
                              (() => {
                                const participantEntry = getRollCallEntryForParticipants(scene, participants.length);

                                if (participantEntry) {
                                  return (
                                    <>
                                      {participantEntry.participants} participant{participantEntry.participants !== 1 ? 's' : ''}
                                      <span className="text-muted ml-2">
                                        · {participantEntry.characters} speaking
                                      </span>
                                      {participantEntry.narrators > 0 && (
                                        <span className="text-muted ml-2">
                                          · {participantEntry.narrators} narrator{participantEntry.narrators !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </>
                                  );
                                }

                                if (charStats.length === 0) {
                                  return <>narrator only</>;
                                }

                                return (
                                  <>
                                    {charCount} character{charCount !== 1 ? 's' : ''}
                                    <span className="text-muted ml-2">
                                      · {summarizeCharacterDialogueLines(charStats)}
                                    </span>
                                  </>
                                );
                              })()
                            )}
                            {pickMode === 'act-scene' && (
                              charStats.length > 0
                                ? charStats.map((c) => c.name).join(', ')
                                : scene.unique_characters.join(', ')
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Confirm button */}
              <div className="sticky bottom-0 bg-surface pt-2 pb-1">
                <button
                  onClick={confirmScene}
                  disabled={previewLoading || (mode === 'pick' && !selectedSceneId)}
                  className="w-full py-3 bg-gold text-black rounded-xl font-semibold hover:bg-gold-dim transition-colors disabled:opacity-50"
                >
                  {previewLoading ? 'Generating Call Sheet...' : mode === 'auto' ? 'Everybody In' : 'Confirm Scene'}
                </button>
                {mode === 'pick' && (
                  <p className="text-xs text-muted text-center mt-1.5">Generates call sheet and assigns roles</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Non-creator: waiting messages for script/scene stages */
        <>
          {stage === 'script' && (
            <p className="text-muted text-sm text-center">
              Waiting for the director to select a script...
            </p>
          )}
          {stage === 'scene' && (
            <p className="text-muted text-sm text-center">
              The director is selecting a scene...
            </p>
          )}
        </>
      )}

      {/* Stage 3: Call Sheet + Role Draft (shared by creator and non-creator) */}
      {stage === 'callsheet' && preview && (
        <>
          <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm text-muted uppercase tracking-wider">Call Sheet</h2>
              {isCreator && (
                <button
                  onClick={() => {
                    setStage('scene');
                    setPreview(null);
                    setReadyUsers(new Set());
                    setRoleClaims(new Map());
                    setWantsNarrator(false);
                    setIsReady(false);
                  }}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Change Scene
                </button>
              )}
            </div>

            {/* Scene header */}
            <div className="text-center mb-4 pb-4 border-b border-border">
              <p className="text-gold font-medium">
                Act {preview.actNumber} &middot; Scene {preview.sceneNumber}
              </p>
              <p className="text-sm text-muted mt-1">{preview.sceneHeading}</p>
              <p className="text-xs text-muted mt-1">{preview.totalLines} rehearsable lines</p>
              {(preview.characters.length > 0 || narrationCount > 0) && (
                <p className="text-xs text-muted mt-1">
                  {preview.characters.length > 0
                    ? `${preview.characters.length} character${preview.characters.length !== 1 ? 's' : ''}`
                    : 'narrator only'}
                  {narrationCount > 0 ? ` · ${narrationCount} narrator line${narrationCount !== 1 ? 's' : ''}` : ''}
                </p>
              )}
            </div>

            {/* Your Roles */}
            {myRoles.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Your Roles</h3>
                <div className="space-y-2">
                  {myRoles.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-3 rounded-xl border border-gold/30 bg-gold/5">
                      <div>
                        <span className="text-sm font-medium text-gold">{c.name}</span>
                        <span className="text-xs text-muted ml-2">{c.dialogueLines} lines</span>
                      </div>
                      {isReady ? (
                        <span className="text-xs text-green-400">Ready</span>
                      ) : (
                        <button
                          onClick={() => releaseMyRole(c.name)}
                          className="text-xs text-muted hover:text-red-400 transition-colors px-2 py-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {wantsNarrator && (
                    <div className="flex items-center justify-between p-3 rounded-xl border border-gold/30 bg-gold/5">
                      <div>
                        <span className="text-sm font-medium text-gold">Narrator</span>
                        <span className="text-xs text-muted ml-2">{narrationCount} lines</span>
                      </div>
                      {isReady ? (
                        <span className="text-xs text-green-400">Ready</span>
                      ) : (
                        <button
                          onClick={() => setWantsNarrator(false)}
                          className="text-xs text-muted hover:text-red-400 transition-colors px-2 py-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Claimed by others */}
            {othersClaims.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Claimed</h3>
                <div className="space-y-2">
                  {othersClaims.map((c) => {
                    const claim = roleClaims.get(c.name)!;
                    return (
                      <div key={c.name} className="flex items-center justify-between p-3 rounded-xl border border-border bg-background/50">
                        <div>
                          <span className="text-sm font-medium">{c.name}</span>
                          <span className="text-xs text-muted ml-2">{c.dialogueLines} lines</span>
                        </div>
                        <span className="text-xs text-muted">{claim.displayName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available Roles */}
            {!isReady && (availableRoles.length > 0 || (!wantsNarrator && narrationCount > 0)) && (
              <div>
                <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Available Roles</h3>
                <div className="space-y-2">
                  {availableRoles.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => claimRole(c.name)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-background/50 hover:border-gold/30 hover:bg-gold/5 transition-all text-left"
                    >
                      <div>
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted ml-2">{c.dialogueLines} lines</span>
                      </div>
                      <span className="text-xs text-gold">Claim</span>
                    </button>
                  ))}
                  {!wantsNarrator && narrationCount > 0 && (
                    <button
                      onClick={() => setWantsNarrator(true)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-background/50 hover:border-gold/30 hover:bg-gold/5 transition-all text-left"
                    >
                      <div>
                        <span className="text-sm font-medium text-muted">+ Narrator</span>
                        <span className="text-xs text-muted ml-2">{narrationCount} lines</span>
                      </div>
                      <span className="text-xs text-gold">Claim</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Ready / Unready / Start buttons */}
          <div className="space-y-3">
            {!isReady && hasRole && (
              <button
                onClick={markReady}
                className="w-full py-3 rounded-xl font-semibold transition-colors bg-surface border border-gold text-gold hover:bg-gold/10"
              >
                Mark as Ready
              </button>
            )}
            {!isReady && !hasRole && (
              <p className="text-xs text-muted text-center py-3">
                Select at least one role to ready up
              </p>
            )}
            {isReady && (
              <>
                <div className="w-full py-3 rounded-xl font-semibold text-center bg-green-500/20 text-green-400 border border-green-500/30">
                  Ready!
                </div>
                <button
                  onClick={unready}
                  className="w-full py-2 text-sm text-muted hover:text-foreground transition-colors"
                >
                  Unready
                </button>
              </>
            )}
            {isCreator && (
              <>
                {unclaimedCount > 0 && (
                  <p className="text-xs text-muted text-center">
                    {unclaimedCount} role{unclaimedCount !== 1 ? 's' : ''} unclaimed — will be auto-assigned
                  </p>
                )}
                {participants.length > 1 && roleClaims.size === 0 && !isNarratorOnly && (
                  <p className="text-xs text-red-400 text-center">
                    At least one person must claim a role
                  </p>
                )}
                <button
                  onClick={startSession}
                  disabled={starting || (participants.length > 1 && roleClaims.size === 0 && !isNarratorOnly)}
                  className="w-full py-3 bg-gold text-black rounded-xl font-semibold text-lg hover:bg-gold-dim transition-colors disabled:opacity-50"
                >
                  {starting
                    ? 'Starting...'
                    : `Start Rehearsal (${readyUsers.size}/${Math.max(participants.length, 1)} ready)`}
                </button>
              </>
            )}
            {!isCreator && (
              <p className="text-muted text-xs text-center">
                Waiting for the director to start the session...
              </p>
            )}
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm text-center mt-4">{error}</p>
      )}

      {/* Leave Room */}
      {confirmLeave ? (
        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-muted">
            You&apos;re the director. Leaving will end the session for everyone.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={leaveRoom}
              className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Leave anyway
            </button>
            <button
              onClick={() => setConfirmLeave(false)}
              className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={leaveRoom}
          className="w-full py-2 text-sm text-muted hover:text-red-400 transition-colors mt-6"
        >
          Leave Room
        </button>
      )}
    </div>
  );
}

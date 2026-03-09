'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/hooks/use-presence';
import type { Room, Script, Act, Scene, RoomPresence } from '@/lib/types';

interface CallSheetEntry {
  userId: string;
  displayName: string;
  totalChunks: number;
  character: string | null;
  dialogueCount: number;
  actionCount: number;
}

interface SceneCharacter {
  name: string;
  dialogueCount: number;
}

interface PreviewData {
  mode: 'pick';
  sceneId: string;
  sceneHeading: string;
  sceneNumber: number;
  actNumber: number;
  totalChunks: number;
  systemChunks: number;
  callSheet: CallSheetEntry[];
  characters: SceneCharacter[];
}

interface RoleClaim {
  userId: string;
  displayName: string;
}

type Stage = 'script' | 'scene' | 'callsheet';

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
  const [mode, setMode] = useState<'auto' | 'pick'>('auto');
  const [selectedActId, setSelectedActId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

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
  const hasRole = myRoles.length > 0 || wantsNarrator;

  // Derived: narration line count
  const narrationCount = preview
    ? preview.totalChunks - preview.characters.reduce((s, c) => s + c.dialogueCount, 0)
    : 0;

  const loadScriptDetails = useCallback(async (scriptId: string) => {
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
      setScenes(scenesData ?? []);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <p className="text-muted">Loading room...</p>
      </div>
    );
  }

  const selectedScript = scripts.find((s) => s.id === selectedScriptId);
  const filteredScenes = selectedActId
    ? scenes.filter((s) => s.act_id === selectedActId)
    : scenes;

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
              <span>{p.displayName}</span>
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
                      <span className="text-xs text-muted">{script.total_chunks} chunks</span>
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

              {/* Pick mode: act/scene selector */}
              {mode === 'pick' && (
                <>
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

                  <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
                    {filteredScenes.map((scene) => (
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
                        <span className="text-muted text-xs mr-2">Scene {scene.scene_number}</span>
                        <span className="text-foreground">{scene.scene_heading || 'Untitled'}</span>
                        <span className="text-muted text-xs ml-2">({scene.total_chunks} chunks)</span>
                        {((scene.character_stats as { name: string }[] | undefined) ?? scene.unique_characters).length > 0 && (
                          <div className="mt-1 text-xs text-gold/70">
                            {(scene.character_stats as { name: string }[] | undefined)
                              ? (scene.character_stats as { name: string }[]).map(c => c.name).join(', ')
                              : scene.unique_characters.join(', ')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Confirm button */}
              <button
                onClick={confirmScene}
                disabled={previewLoading || (mode === 'pick' && !selectedSceneId && !selectedActId)}
                className="w-full py-3 bg-gold text-black rounded-xl font-semibold hover:bg-gold-dim transition-colors disabled:opacity-50"
              >
                {previewLoading ? 'Generating Call Sheet...' : mode === 'auto' ? 'Everybody In' : 'Confirm Scene'}
              </button>
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
              <p className="text-xs text-muted mt-1">{preview.totalChunks} rehearsable chunks</p>
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
                        <span className="text-xs text-muted ml-2">{c.dialogueCount} lines</span>
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
                          <span className="text-xs text-muted ml-2">{c.dialogueCount} lines</span>
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
                        <span className="text-xs text-muted ml-2">{c.dialogueCount} lines</span>
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
                <button
                  onClick={startSession}
                  disabled={starting}
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
    </div>
  );
}

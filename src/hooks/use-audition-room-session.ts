'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { AuditionRoomVoicePresence } from '@/lib/types';

type RoomEventPayload = {
  type: string;
  actorUserId?: string;
  takeId?: string | null;
  sequenceIndex?: number;
  reason?: string;
};

type VoiceSignalPayload = {
  fromUserId: string;
  toUserId: string;
  description?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
};

type PresencePayload = {
  userId: string;
  displayName: string | null;
  isConnected: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  lastSeenAt: string | null;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
};

function createDefaultPresence(userId: string, displayName: string | null): PresencePayload {
  return {
    userId,
    displayName,
    isConnected: false,
    isMuted: false,
    isSpeaking: false,
    audioLevel: 0,
    lastSeenAt: new Date().toISOString(),
  };
}

export function useAuditionRoomSession(input: {
  roomCode: string | null;
  userId: string;
  displayName: string | null;
  autoRequestMic?: boolean;
  enabled?: boolean;
  onRoomEvent?: (payload: RoomEventPayload) => void;
}) {
  const { roomCode, userId, displayName, autoRequestMic = false, enabled = true } = input;
  const supabase = useMemo(() => createClient(), []);
  const handleRoomEvent = useEffectEvent((payload: RoomEventPayload) => {
    input.onRoomEvent?.(payload);
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localPresenceRef = useRef<PresencePayload>(createDefaultPresence(userId, displayName));
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const [voicePresence, setVoicePresence] = useState<AuditionRoomVoicePresence[]>([]);
  const [micReady, setMicReady] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const publishPresence = useCallback(async (patch: Partial<PresencePayload> = {}) => {
    const channel = channelRef.current;
    if (!channel) return;
    localPresenceRef.current = {
      ...localPresenceRef.current,
      ...patch,
      displayName,
      userId,
      lastSeenAt: new Date().toISOString(),
    };
    await channel.track(localPresenceRef.current).catch(() => undefined);
  }, [displayName, userId]);

  const cleanupPeer = useCallback((remoteUserId: string) => {
    const peer = peerConnectionsRef.current.get(remoteUserId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peerConnectionsRef.current.delete(remoteUserId);
    }
    const audio = audioElementsRef.current.get(remoteUserId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(remoteUserId);
    }
    pendingCandidatesRef.current.delete(remoteUserId);
  }, []);

  const shouldInitiateOffer = useCallback((remoteUserId: string) => {
    return userId.localeCompare(remoteUserId) > 0;
  }, [userId]);

  const sendVoiceSignal = useCallback(async (payload: VoiceSignalPayload) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'voice_signal',
      payload,
    }).catch(() => undefined);
  }, []);

  const ensurePeer = useCallback((remoteUserId: string) => {
    let peer = peerConnectionsRef.current.get(remoteUserId);
    if (peer) return peer;

    peer = new RTCPeerConnection(RTC_CONFIG);
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendVoiceSignal({
        fromUserId: userId,
        toUserId: remoteUserId,
        candidate: event.candidate.toJSON(),
      });
    };
    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      let audio = audioElementsRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElementsRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
    };
    peer.onconnectionstatechange = () => {
      if (peer && ['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
        cleanupPeer(remoteUserId);
      }
    };

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        peer.addTrack(track, localStreamRef.current);
      }
    }

    peerConnectionsRef.current.set(remoteUserId, peer);
    return peer;
  }, [cleanupPeer, sendVoiceSignal, userId]);

  const createAndSendOffer = useCallback(async (remoteUserId: string) => {
    if (!localStreamRef.current) return;
    const peer = ensurePeer(remoteUserId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendVoiceSignal({
      fromUserId: userId,
      toUserId: remoteUserId,
      description: peer.localDescription,
    });
  }, [ensurePeer, sendVoiceSignal, userId]);

  const requestMicrophone = useCallback(async () => {
    if (localStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      setMicReady(true);
      setMicError(null);
      setMicMuted(false);

      const ctx = localAudioContextRef.current ?? new AudioContext();
      localAudioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      localAnalyserRef.current = analyser;

      for (const remoteUserId of peerConnectionsRef.current.keys()) {
        const peer = ensurePeer(remoteUserId);
        const hasAudioSender = peer.getSenders().some((sender) => sender.track?.kind === 'audio');
        if (!hasAudioSender) {
          for (const track of stream.getAudioTracks()) {
            peer.addTrack(track, stream);
          }
        }
        if (shouldInitiateOffer(remoteUserId)) {
          void createAndSendOffer(remoteUserId);
        }
      }

      await publishPresence({
        isConnected: true,
        isMuted: false,
      });
    } catch {
      setMicReady(false);
      setMicError('Microphone unavailable');
      await publishPresence({
        isConnected: false,
        isMuted: true,
        isSpeaking: false,
        audioLevel: 0,
      });
    }
  }, [createAndSendOffer, ensurePeer, publishPresence, shouldInitiateOffer]);

  const toggleMute = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) {
      await requestMicrophone();
      return;
    }
    const nextMuted = !micMuted;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setMicMuted(nextMuted);
    await publishPresence({
      isConnected: true,
      isMuted: nextMuted,
      isSpeaking: false,
      audioLevel: 0,
    });
  }, [micMuted, publishPresence, requestMicrophone]);

  useEffect(() => {
    if (!enabled || !roomCode) return;

    const channel = supabase.channel(`audition-room:${roomCode}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'room_event' }, ({ payload }) => {
        handleRoomEvent(payload as RoomEventPayload);
      })
      .on('broadcast', { event: 'voice_signal' }, async ({ payload }) => {
        const signal = payload as VoiceSignalPayload;
        if (signal.toUserId !== userId || signal.fromUserId === userId) return;

        const peer = ensurePeer(signal.fromUserId);

        if (signal.description) {
          await peer.setRemoteDescription(signal.description);
          const pending = pendingCandidatesRef.current.get(signal.fromUserId) ?? [];
          for (const candidate of pending) {
            await peer.addIceCandidate(candidate).catch(() => undefined);
          }
          pendingCandidatesRef.current.delete(signal.fromUserId);

          if (signal.description.type === 'offer') {
            if (localStreamRef.current) {
              const hasAudioSender = peer.getSenders().some((sender) => sender.track?.kind === 'audio');
              if (!hasAudioSender) {
                for (const track of localStreamRef.current.getAudioTracks()) {
                  peer.addTrack(track, localStreamRef.current);
                }
              }
            }
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendVoiceSignal({
              fromUserId: userId,
              toUserId: signal.fromUserId,
              description: peer.localDescription,
            });
          }
        }

        if (signal.candidate) {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(signal.candidate).catch(() => undefined);
          } else {
            const pending = pendingCandidatesRef.current.get(signal.fromUserId) ?? [];
            pending.push(signal.candidate);
            pendingCandidatesRef.current.set(signal.fromUserId, pending);
          }
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        const nextPresence = new Map<string, AuditionRoomVoicePresence>();

        for (const presences of Object.values(state)) {
          for (const presence of presences) {
            if (!presence?.userId) continue;
            nextPresence.set(presence.userId, {
              userId: presence.userId,
              displayName: presence.displayName ?? null,
              isConnected: Boolean(presence.isConnected),
              isMuted: Boolean(presence.isMuted),
              isSpeaking: Boolean(presence.isSpeaking),
              audioLevel: Number(presence.audioLevel ?? 0),
              lastSeenAt: presence.lastSeenAt ?? null,
            });
          }
        }

        const remoteUserIds = new Set(
          Array.from(nextPresence.values())
            .filter((presence) => presence.userId !== userId)
            .map((presence) => presence.userId),
        );

        for (const remoteUserId of peerConnectionsRef.current.keys()) {
          if (!remoteUserIds.has(remoteUserId)) {
            cleanupPeer(remoteUserId);
          }
        }

        for (const remoteUserId of remoteUserIds) {
          ensurePeer(remoteUserId);
          if (localStreamRef.current && shouldInitiateOffer(remoteUserId)) {
            void createAndSendOffer(remoteUserId);
          }
        }

        setVoicePresence(
          Array.from(nextPresence.values()).sort((a, b) => {
            if (a.userId === userId) return -1;
            if (b.userId === userId) return 1;
            return (a.displayName ?? a.userId).localeCompare(b.displayName ?? b.userId);
          }),
        );
      });

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      void publishPresence();
      if (autoRequestMic) {
        void requestMicrophone();
      }
    });

    const peerConnections = peerConnectionsRef.current;
    return () => {
      const peerUserIds = Array.from(peerConnections.keys());
      for (const peerUserId of peerUserIds) {
        cleanupPeer(peerUserId);
      }
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [
    autoRequestMic,
    cleanupPeer,
    createAndSendOffer,
    enabled,
    ensurePeer,
    publishPresence,
    requestMicrophone,
    roomCode,
    sendVoiceSignal,
    shouldInitiateOffer,
    supabase,
    userId,
  ]);

  useEffect(() => {
    if (!localAnalyserRef.current || !localStreamRef.current) return;
    const analyser = localAnalyserRef.current;
    const data = new Uint8Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      if (micMuted) return;
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const audioLevel = Number(Math.min(1, rms * 4).toFixed(3));
      const isSpeaking = audioLevel > 0.09;
      if (
        Math.abs(audioLevel - localPresenceRef.current.audioLevel) > 0.04 ||
        isSpeaking !== localPresenceRef.current.isSpeaking
      ) {
        void publishPresence({
          isConnected: true,
          isMuted: micMuted,
          isSpeaking,
          audioLevel,
        });
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [micMuted, publishPresence]);

  useEffect(() => {
    return () => {
      localAnalyserRef.current = null;
      if (localAudioContextRef.current && localAudioContextRef.current.state !== 'closed') {
        void localAudioContextRef.current.close().catch(() => undefined);
      }
      localAudioContextRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, []);

  const broadcastRoomEvent = useCallback(async (payload: RoomEventPayload) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'room_event',
      payload: {
        ...payload,
        actorUserId: payload.actorUserId ?? userId,
      },
    }).catch(() => undefined);
  }, [userId]);

  return {
    broadcastRoomEvent,
    micError,
    micMuted,
    micReady,
    requestMicrophone,
    toggleMute,
    voicePresence,
  };
}

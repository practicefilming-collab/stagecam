'use client';

import { useCallback, useEffect } from 'react';

function transitionKey(roomCode: string) {
  return `audition-room-transition:${roomCode}`;
}

export function useAuditionRoomLeave(roomCode: string | null) {
  const markInternalTransition = useCallback(() => {
    if (!roomCode) return;
    window.sessionStorage.setItem(transitionKey(roomCode), '1');
  }, [roomCode]);

  const leaveRoom = useCallback(async () => {
    if (!roomCode) return;
    await fetch(`/api/audition-rooms/${roomCode}/participants/me/leave`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;

    const clearTransition = window.setTimeout(() => {
      window.sessionStorage.removeItem(transitionKey(roomCode));
    }, 1500);

    const handlePageHide = () => {
      if (window.sessionStorage.getItem(transitionKey(roomCode)) === '1') return;
      navigator.sendBeacon(`/api/audition-rooms/${roomCode}/participants/me/leave`);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearTimeout(clearTransition);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [roomCode]);

  return {
    leaveRoom,
    markInternalTransition,
  };
}

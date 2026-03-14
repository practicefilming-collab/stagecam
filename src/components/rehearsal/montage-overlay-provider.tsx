'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { LoadingMontage } from './loading-montage';
import type { Line, AssignedLine } from '@/lib/types';

/** Minimum time (ms) after lines arrive before dismiss is allowed.
 *  2 full cycles × 2800ms = 5600ms → user sees 3 slides. */
const MIN_LINES_DISPLAY = 5600;

interface MontageContextValue {
  showMontage: (scriptTitle: string) => void;
  updateLines: (lines: Line[], assignedLines: AssignedLine[]) => void;
  dismissMontage: () => void;
}

const MontageContext = createContext<MontageContextValue | null>(null);

export function useMontageOverlay(): MontageContextValue {
  const ctx = useContext(MontageContext);
  if (!ctx) throw new Error('useMontageOverlay must be used within MontageOverlayProvider');
  return ctx;
}

export function MontageOverlayProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(true);
  const [scriptTitle, setScriptTitle] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [assignedLines, setAssignedLines] = useState<AssignedLine[]>([]);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const linesReceivedAt = useRef<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMontage = useCallback((title: string) => {
    setScriptTitle(title);
    setLines([]);
    setAssignedLines([]);
    setPendingDismiss(false);
    linesReceivedAt.current = null;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setVisible(true);
    setActive(true);
  }, []);

  const updateLines = useCallback((newLines: Line[], newAssigned: AssignedLine[]) => {
    setLines(newLines);
    setAssignedLines(newAssigned);
    if (newLines.length > 0 && linesReceivedAt.current === null) {
      linesReceivedAt.current = Date.now();
    }
  }, []);

  const dismissMontage = useCallback(() => {
    const elapsed = linesReceivedAt.current ? Date.now() - linesReceivedAt.current : 0;
    const remaining = MIN_LINES_DISPLAY - elapsed;

    if (remaining <= 0 || !linesReceivedAt.current) {
      setVisible(false);
    } else {
      setPendingDismiss(true);
    }
  }, []);

  // Deferred dismiss: wait for min display time then fade out
  useEffect(() => {
    if (!pendingDismiss || !linesReceivedAt.current) return;
    const elapsed = Date.now() - linesReceivedAt.current;
    const remaining = MIN_LINES_DISPLAY - elapsed;

    if (remaining <= 0) {
      setVisible(false);
      setPendingDismiss(false);
      return;
    }

    dismissTimer.current = setTimeout(() => {
      setVisible(false);
      setPendingDismiss(false);
    }, remaining);

    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [pendingDismiss]);

  const handleExited = useCallback(() => {
    setActive(false);
  }, []);

  return (
    <MontageContext.Provider value={{ showMontage, updateLines, dismissMontage }}>
      {children}
      {active && (
        <LoadingMontage
          lines={lines}
          assignedLines={assignedLines}
          scriptTitle={scriptTitle}
          visible={visible}
          onExited={handleExited}
        />
      )}
    </MontageContext.Provider>
  );
}

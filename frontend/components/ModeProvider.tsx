"use client";

/**
 * ModeProvider — client-side toggle between DEMO and LIVE work modes.
 *
 * This is a presentation/data-filtering choice (not a backend security
 * boundary). The backend always runs in the same simulated connector mode;
 * this toggle changes what the UI surfaces:
 *
 *   DEMO — show "Load Memorial Day" button, pre-seeded scenarios, sample
 *          data hints. Optimised for first-time reviewers who want a guided
 *          tour without typing anything.
 *
 *   LIVE — hide demo shortcuts, show "Upload your data" call-to-action,
 *          clean slate. Optimised for someone bringing their own catalog
 *          who wants to feel like they're configuring their actual store.
 *
 * Persisted to localStorage so the choice survives reloads.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type WorkMode = "demo" | "live";

interface ModeContextValue {
  mode: WorkMode;
  setMode: (m: WorkMode) => void;
  toggle: () => void;
  isHydrated: boolean;
}

const ModeContext = createContext<ModeContextValue | null>(null);

const STORAGE_KEY = "shelftrace.work_mode";

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<WorkMode>("demo");
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "live" || stored === "demo") {
        setModeState(stored);
      }
    } catch {
      // localStorage blocked (e.g. private mode); fall back to default
    }
    setIsHydrated(true);
  }, []);

  const setMode = useCallback((m: WorkMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "demo" ? "live" : "demo");
  }, [mode, setMode]);

  return (
    <ModeContext.Provider value={{ mode, setMode, toggle, isHydrated }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useWorkMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    // Sensible default if used outside provider (avoids crashes during SSR)
    return {
      mode: "demo",
      setMode: () => {},
      toggle: () => {},
      isHydrated: false,
    };
  }
  return ctx;
}

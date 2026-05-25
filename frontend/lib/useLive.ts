"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useLive — fetch-on-mount + reload-on-demand with cancellation.
 *
 * If the component unmounts (or deps change) mid-fetch, the result is
 * discarded and state setters are not called. Prevents:
 *  • the classic "Can't perform a React state update on an unmounted
 *    component" warning
 *  • the silent staleness bug where a slow late response overrides a
 *    faster fresh one (each call gets an `epoch`; only the latest
 *    epoch's result is committed)
 *
 * Note: this only protects React state. We don't pipe an AbortSignal
 * into the underlying fetch() because every api.* call would need to
 * accept one. For the demo's polling cadence the in-flight request
 * completing in the background is harmless — the result just gets
 * dropped.
 */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const epochRef = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    const epoch = ++epochRef.current;
    setLoading(true);
    try {
      const d = await fn();
      if (!mountedRef.current || epoch !== epochRef.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!mountedRef.current || epoch !== epochRef.current) return;
      setError((e as Error).message);
    } finally {
      if (mountedRef.current && epoch === epochRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { data, error, loading, reload: load };
}

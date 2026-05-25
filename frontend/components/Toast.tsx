"use client";

/**
 * Toast — context-based notification system.
 *
 * Replaces the ad-hoc `setMessage("...")` pattern scattered across
 * pages with a single global queue. Toasts auto-dismiss, stack
 * cleanly, respect prefers-reduced-motion, and can be dismissed by
 * click.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success("Applied to ShelfTrace");
 *   toast.error("Could not load");
 *   toast.info("...", { duration: 0 })  // sticky
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import clsx from "clsx";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type Variant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  variant: Variant;
  message: string;
  duration: number; // ms; 0 = sticky
}

interface ToastApi {
  success: (message: string, opts?: { duration?: number }) => void;
  error: (message: string, opts?: { duration?: number }) => void;
  info: (message: string, opts?: { duration?: number }) => void;
}

const ToastContext = createContext<{ toast: ToastApi } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (variant: Variant, message: string, duration: number) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setItems((xs) => [...xs, { id, variant, message, duration }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      success: (m, o = {}) => push("success", m, o.duration ?? 4000),
      error: (m, o = {}) => push("error", m, o.duration ?? 6000),
      info: (m, o = {}) => push("info", m, o.duration ?? 4000),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): { toast: ToastApi } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Provide a no-op fallback so call sites don't crash when used
    // outside the provider (e.g., during SSR / tests).
    return {
      toast: {
        success: () => {},
        error: () => {},
        info: () => {},
      },
    };
  }
  return ctx;
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const tone =
            item.variant === "success"
              ? "border-emerald-500/30 bg-emerald-500/[.10] text-emerald-100"
              : item.variant === "error"
                ? "border-rose-500/35 bg-rose-500/[.10] text-rose-100"
                : "border-sky-500/30 bg-sky-500/[.10] text-sky-100";
          const Icon =
            item.variant === "success"
              ? CheckCircle2
              : item.variant === "error"
                ? AlertTriangle
                : Info;
          return (
            <motion.div
              key={item.id}
              role="status"
              initial={reduced ? false : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={clsx(
                "pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-[#0a0e18]/95 px-3 py-2.5 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur",
                tone,
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" />
              <p className="min-w-0 flex-1 text-sm leading-relaxed">
                {item.message}
              </p>
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                aria-label="Dismiss"
                className="mt-0.5 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

"use client";

/**
 * ConfirmDialog — controlled modal for destructive actions.
 *
 * Standard safety net for irreversible / high-impact operations
 * (Reset Demo, Delete Scenario, Rollback Shelf Label, etc).
 * Focus is trapped while open, Esc closes, click-outside dismisses,
 * and the confirm button receives initial focus so keyboard-first
 * users can hit Enter.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   const [busy, setBusy] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     title="Reset demo state?"
 *     body="This will wipe scenarios and reseed the Memorial Day batch."
 *     confirmLabel="Reset"
 *     variant="danger"
 *     busy={busy}
 *     onCancel={() => setOpen(false)}
 *     onConfirm={async () => { setBusy(true); await api.reset(); setBusy(false); setOpen(false); }}
 *   />
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "neutral";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const reduced = useReducedMotion();
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when opened
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Esc to cancel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && onCancel()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0e18] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start gap-3">
              <span
                className={clsx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
                  variant === "danger"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    : "border-sky-500/40 bg-sky-500/10 text-sky-300",
                )}
              >
                {variant === "danger" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="confirm-title"
                  className="text-base font-semibold text-white"
                >
                  {title}
                </h2>
                <div className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  {body}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={clsx(
                  "rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition",
                  variant === "danger"
                    ? "bg-rose-500 hover:bg-rose-400"
                    : "bg-brand hover:bg-brand-600",
                  busy && "cursor-wait opacity-60",
                )}
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

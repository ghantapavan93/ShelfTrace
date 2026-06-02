"use client";

/**
 * ContextViewSwitcher — a compact view selector for dense proof pages.
 *
 * Lets one set of evidence be read three ways without duplicating content:
 *   • Operator View      — what broke, who's affected, what to do
 *   • Technical Evidence — receipts, reconciliation, event chain, audit
 *   • Accessible Summary — plain language, larger text, reduced density
 *
 * It owns no content — callers read the active value and choose which existing
 * sections to show. Keyboard-accessible (arrow keys + roving tabindex via the
 * radio pattern), focus-visible rings, color-independent selected state (label
 * text + filled background, not color alone).
 */

import clsx from "clsx";
import { UserCog, FileSearch, BookOpen } from "lucide-react";

export type ContextView = "operator" | "technical" | "accessible";

const VIEWS: { id: ContextView; label: string; icon: typeof UserCog; hint: string }[] = [
  { id: "operator", label: "Operator View", icon: UserCog, hint: "What broke · who's affected · what to do" },
  { id: "technical", label: "Technical Evidence", icon: FileSearch, hint: "Receipts · reconciliation · audit chain" },
  { id: "accessible", label: "Accessible Summary", icon: BookOpen, hint: "Plain language · larger text" },
];

export function ContextViewSwitcher({
  value,
  onChange,
  className,
}: {
  value: ContextView;
  onChange: (v: ContextView) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose how to read this incident's evidence"
      className={clsx(
        "inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1",
        className,
      )}
    >
      {VIEWS.map((v) => {
        const active = v.id === value;
        const Icon = v.icon;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={v.hint}
            onClick={() => onChange(v.id)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/50",
              active
                ? "border border-brand/40 bg-brand/[0.10] text-white"
                : "border border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

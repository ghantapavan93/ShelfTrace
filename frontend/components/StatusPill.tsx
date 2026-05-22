import clsx from "clsx";

const MAP: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "text-verified bg-emerald-500/10 border-emerald-500/30" },
  eligible: { label: "Eligible", cls: "text-verified bg-emerald-500/10 border-emerald-500/30" },
  // certification check statuses
  passed: { label: "Passed", cls: "text-verified bg-emerald-500/10 border-emerald-500/30" },
  failed: { label: "Failed", cls: "text-danger bg-rose-500/10 border-rose-500/30" },
  recovered: { label: "Recovered", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  mismatch: { label: "Mismatch", cls: "text-danger bg-rose-500/10 border-rose-500/30" },
  blocked: { label: "Blocked", cls: "text-danger bg-rose-500/10 border-rose-500/30" },
  critical: { label: "Critical", cls: "text-danger bg-rose-500/10 border-rose-500/40" },
  timeout: { label: "Timeout", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  retry: { label: "Retry", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  urgent: { label: "Urgent", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  pending: { label: "Pending", cls: "text-slate-300 bg-white/5 border-white/15" },
  warning: { label: "Warning", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  open: { label: "Open", cls: "text-danger bg-rose-500/10 border-rose-500/30" },
  retrying: { label: "Retrying", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  resolved: { label: "Resolved", cls: "text-verified bg-emerald-500/10 border-emerald-500/30" },
  rolled_back: { label: "Rolled Back", cls: "text-slate-300 bg-white/5 border-white/15" },
  // batch statuses
  canary_verifying: { label: "Canary Verifying", cls: "text-warn bg-amber-500/10 border-amber-500/30" },
  partially_blocked: { label: "Partially Blocked", cls: "text-warn bg-amber-500/10 border-amber-500/40" },
  ready_for_expansion: { label: "Ready for Expansion", cls: "text-verified bg-emerald-500/10 border-emerald-500/30" },
  expanding: { label: "Expanding", cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
  completed: { label: "Completed", cls: "text-verified bg-emerald-500/10 border-emerald-500/30" },
};

export function StatusPill({ value, label }: { value: string; label?: string }) {
  const m = MAP[value] ?? { label: label ?? value, cls: "text-slate-300 bg-white/5 border-white/15" };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        m.cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? m.label}
    </span>
  );
}

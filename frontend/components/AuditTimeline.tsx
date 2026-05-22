import clsx from "clsx";
import { CheckCircle2, AlertCircle, RotateCcw, User, Cpu, Server } from "lucide-react";
import { dateTimeOf } from "@/lib/format";
import type { AuditEventView } from "@/lib/types";

function iconFor(ev: AuditEventView) {
  const e = ev.event.toLowerCase();
  if (e.includes("critical") || e.includes("blocked") || e.includes("mismatch") || e.includes("risk"))
    return { Icon: AlertCircle, cls: "text-danger border-rose-500/40 bg-rose-500/10" };
  if (e.includes("retry")) return { Icon: RotateCcw, cls: "text-warn border-amber-500/40 bg-amber-500/10" };
  if (e.includes("resolved") || e.includes("unblocked") || e.includes("verified") || e.includes("accepted"))
    return { Icon: CheckCircle2, cls: "text-verified border-emerald-500/40 bg-emerald-500/10" };
  return { Icon: Server, cls: "text-slate-300 border-white/15 bg-white/5" };
}

function actorBadge(actor: string) {
  const map = {
    operator: { label: "Operator", Icon: User, cls: "text-brand-400 border-brand/30 bg-brand/10" },
    automated: { label: "Automated", Icon: Cpu, cls: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
    system: { label: "System", Icon: Server, cls: "text-slate-300 border-white/15 bg-white/5" },
  }[actor] ?? { label: actor, Icon: Server, cls: "text-slate-300 border-white/15 bg-white/5" };
  const I = map.Icon;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium", map.cls)}>
      <I className="h-3 w-3" /> {map.label}
    </span>
  );
}

export function AuditTimeline({ events }: { events: AuditEventView[] }) {
  return (
    <ol className="relative space-y-5">
      {events.map((ev, i) => {
        const { Icon, cls } = iconFor(ev);
        return (
          <li key={ev.id} className="relative flex gap-3">
            {i < events.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-white/10" />
            )}
            <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full border", cls)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">{ev.event}</span>
                {actorBadge(ev.actor)}
                <span className="text-[11px] text-slate-500">{dateTimeOf(ev.created_at)}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{ev.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

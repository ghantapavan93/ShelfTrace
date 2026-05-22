"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  RotateCcw,
  Undo2,
  ClipboardList,
  Activity,
  Lightbulb,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { ChannelPedestal, ChannelThread } from "@/components/ChannelPedestal";
import { AuditTimeline } from "@/components/AuditTimeline";
import type { AuditEventView, IncidentExplanation, IncidentView } from "@/lib/types";

export default function IncidentPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const inc = useLive<IncidentView>(() => api.incident(id), [id]);
  const exp = useLive<IncidentExplanation>(() => api.explanation(id), [id]);
  const audit = useLive<AuditEventView[]>(() => api.incidentAudit(id), [id]);

  async function act(kind: "retry" | "rollback" | "resolve" | "task") {
    setBusy(kind);
    setToast(null);
    try {
      if (kind === "retry") await api.retry(id);
      if (kind === "rollback") await api.rollback(id);
      if (kind === "resolve") await api.resolve(id);
      if (kind === "task") await api.storeTask(id);
      await Promise.all([inc.reload(), exp.reload(), audit.reload()]);
      setToast(
        kind === "retry"
          ? "Retry sent — channels re-verified."
          : kind === "rollback"
            ? "Shelf label rolled back to match checkout."
            : kind === "resolve"
              ? "Incident resolved."
              : "Store verification task created.",
      );
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (inc.error) return <div className="glass rounded-2xl p-6 text-slate-300">Incident not found.</div>;
  if (!inc.data) return <div className="text-slate-400">Loading incident…</div>;

  const i = inc.data;
  const offending = i.channels.find((c) => c.channel === i.offending_channel);
  const variance = offending?.observed_price != null ? offending.observed_price - i.approved_price : null;
  const resolved = i.status === "resolved" || i.status === "rolled_back";

  return (
    <div className="space-y-6">
      <Link href="/operations/incidents" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to incidents
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">Price Integrity Incident</h1>
            <StatusPill value={i.severity} />
          </div>
          <p className="mt-1 text-slate-400">
            {i.product_name} · Store {i.store_id}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div className="mono text-slate-300">{i.id}</div>
          <div className="mt-1 flex items-center justify-end gap-1">
            <span className={clsx("h-1.5 w-1.5 rounded-full", resolved ? "bg-verified" : "bg-danger animate-pulse-glow")} />
            {resolved ? "Resolved" : "Live"}
          </div>
        </div>
      </div>

      {/* Channel pedestals stage */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-ink-900 to-black px-6 py-10"
      >
        {variance != null && Math.abs(variance) > 0.001 && (
          <div className="mx-auto mb-6 w-fit rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-center shadow-glow-danger">
            <div className="text-lg font-bold text-danger">
              {variance > 0 ? "+" : ""}
              {money(variance)}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-rose-300/80">Variance vs approved</div>
          </div>
        )}
        <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <ChannelPedestal channel={i.channels.find((c) => c.channel === "esl")!} index={0} />
          <ChannelThread />
          <ChannelPedestal channel={i.channels.find((c) => c.channel === "pos")!} index={1} />
          <ChannelThread />
          <ChannelPedestal channel={i.channels.find((c) => c.channel === "ecommerce")!} index={2} />
        </div>
        <div className="mx-auto mt-8 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-400" /> Approved price (from batch)
          <span className="mono font-semibold text-white">{money(i.approved_price)}</span>
        </div>
      </motion.section>

      {/* Explanation */}
      {exp.data && (
        <section className="grid gap-4 lg:grid-cols-3">
          <Panel icon={Activity} title="What happened?">
            <p className="text-sm leading-relaxed text-slate-300">{exp.data.what_happened}</p>
          </Panel>
          <Panel icon={Lightbulb} title="Why this matters">
            <p className="text-sm leading-relaxed text-slate-300">{exp.data.why_it_matters}</p>
          </Panel>
          <Panel icon={ShieldCheck} title="Recommended recovery path">
            <ol className="space-y-2">
              {exp.data.recommended_next_actions.map((a, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-slate-300">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/20 text-[11px] font-bold text-brand-400">
                    {idx + 1}
                  </span>
                  {a}
                </li>
              ))}
            </ol>
          </Panel>
        </section>
      )}

      {/* Actions */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ActionButton
          primary
          icon={RotateCcw}
          label="Retry POS Update"
          loading={busy === "retry"}
          disabled={resolved}
          onClick={() => act("retry")}
        />
        <ActionButton icon={Undo2} label="Roll Back Shelf Label" loading={busy === "rollback"} disabled={resolved} onClick={() => act("rollback")} />
        <ActionButton icon={ClipboardList} label="Create Store Task" loading={busy === "task"} onClick={() => act("task")} />
        <ActionButton icon={CheckCircle2} label="Resolve" loading={busy === "resolve"} disabled={resolved} onClick={() => act("resolve")} />
      </section>

      {toast && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm text-brand-400">{toast}</div>
      )}

      {/* Audit timeline */}
      <section className="glass rounded-2xl p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Audit Timeline</h3>
        {audit.data && audit.data.length > 0 ? (
          <AuditTimeline events={audit.data} />
        ) : (
          <p className="text-sm text-slate-500">No audit events yet.</p>
        )}
      </section>
    </div>
  );
}

function Panel({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="h-4 w-4 text-brand-400" /> {title}
      </div>
      {children}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
  primary,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={clsx(
        "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-40",
        primary
          ? "bg-gradient-to-r from-brand to-brand-600 text-white shadow-glow-brand hover:brightness-110"
          : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
      )}
    >
      <Icon className={clsx("h-4 w-4", loading && "animate-spin")} /> {label}
    </button>
  );
}

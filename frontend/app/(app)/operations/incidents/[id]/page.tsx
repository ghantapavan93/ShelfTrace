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
  FileCheck2,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart2,
  UserCheck,
  StickyNote,
  Send,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { ChannelPedestal, ChannelThread } from "@/components/ChannelPedestal";
import { AuditTimeline } from "@/components/AuditTimeline";
import { EligibilityPanel } from "@/components/EligibilityPanel";
import { DetailSkeleton } from "@/components/Skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useWorkMode } from "@/components/ModeProvider";
import { FlaskConical } from "lucide-react";
import type {
  AuditEventView,
  IncidentExplanation,
  IncidentView,
  StoreTaskView,
} from "@/lib/types";

// A note an operator jots while working an incident. Session-only — there is
// no backend note endpoint, so these live in component state and are clearly
// labelled "(session note)" in the UI. They are NOT persisted or audited.
interface SessionNote {
  id: string;
  text: string;
  at: string;
}

export default function IncidentPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  // The open field-verification task this operator created this session, if
  // any. Lets us surface its instruction and gate "Mark Verification Complete"
  // (the backend 409s when no open task exists). Cleared once completed.
  const [storeTask, setStoreTask] = useState<StoreTaskView | null>(null);
  // Session-only operator scratch notes (see SessionNote — not persisted).
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const { toast } = useToast();
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";

  const inc = useLive<IncidentView>(() => api.incident(id), [id]);
  const exp = useLive<IncidentExplanation>(() => api.explanation(id), [id]);
  const audit = useLive<AuditEventView[]>(() => api.incidentAudit(id), [id]);

  async function act(kind: "retry" | "rollback" | "resolve" | "task" | "complete") {
    setBusy(kind);
    try {
      if (kind === "retry") await api.retry(id);
      if (kind === "rollback") await api.rollback(id);
      if (kind === "resolve") await api.resolve(id);
      if (kind === "task") {
        const task = await api.storeTask(id);
        setStoreTask(task);
      }
      if (kind === "complete") {
        await api.completeStoreTask(id);
        // Task is closed server-side; drop the open-task affordance.
        setStoreTask(null);
      }
      // Re-fetch the incident view, explanation, and audit timeline so the
      // page visibly reflects the new state — POS receipt, RESOLVED status,
      // and the measurement gate all re-render from fresh data.
      await Promise.all([inc.reload(), exp.reload(), audit.reload()]);
      toast.success(
        kind === "retry"
          ? "Retry sent — channels re-verified."
          : kind === "rollback"
            ? "Shelf label rolled back to match checkout."
            : kind === "resolve"
              ? "Incident resolved."
              : kind === "complete"
                ? "Verification confirmed — shelf re-reconciled."
                : "Store verification task created.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      if (kind === "rollback") setConfirmRollback(false);
      if (kind === "retry") setConfirmRetry(false);
      if (kind === "resolve") setConfirmResolve(false);
    }
  }

  function addNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setNotes((prev) => [
      { id: `note-${Date.now()}`, text, at: new Date().toISOString() },
      ...prev,
    ]);
    setNoteDraft("");
  }

  if (inc.error) return <div className="glass rounded-2xl p-6 text-slate-300">Incident not found.</div>;
  if (!inc.data) return <DetailSkeleton />;

  const i = inc.data;
  const offending = i.channels.find((c) => c.channel === i.offending_channel);
  const variance = offending?.observed_price != null ? offending.observed_price - i.approved_price : null;
  const resolved = i.status === "resolved" || i.status === "rolled_back";
  // The "Retry" verb is channel-specific: an ESL deadline-risk re-pushes the
  // shelf label, a POS mismatch re-pushes the register update. Keep the label
  // honest instead of hardcoding "POS".
  const offendingLabel =
    i.offending_channel === "esl"
      ? "Shelf Label (ESL)"
      : i.offending_channel === "ecommerce"
        ? "Ecommerce"
        : "POS";
  const retryLabel = `Retry ${offendingLabel} Update`;
  // Surface a small chip when a Live-mode user opens an incident from
  // a demo batch, the Realistic Scale catalog, or a certification
  // sandbox — explicit escape hatch.
  const viewingDemoFromLive =
    isLiveWorkMode &&
    (i.batch_external_id === DEMO_BATCH ||
      i.batch_external_id === "realistic-scale-catalog" ||
      i.batch_external_id.startsWith("certification-"));

  return (
    <div className="space-y-6">
      <Link href="/operations/incidents" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to incidents
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-white">Price Integrity Incident</h1>
            {resolved ? (
              <span className="inline-flex items-center gap-2">
                <StatusPill value={i.status} />
                <span className="text-xs text-slate-500">Initial severity: {i.severity}</span>
              </span>
            ) : (
              <StatusPill value={i.severity} />
            )}
            {viewingDemoFromLive && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.18em] text-violet-200">
                <FlaskConical className="h-2.5 w-2.5" />
                {i.batch_external_id === DEMO_BATCH ? "Demo incident" : "Cert sandbox"}
                <span className="text-violet-300/70">· Live mode</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-slate-400">
            {i.product_name} · Store {i.store_id}
          </p>
          {/* Potential Shopper Impact — shown only when observed price
              diverges from approved (price_mismatch type). canary / expansion
              store counts are on the batch, not the incident view, so only
              the per-transaction delta is shown here. */}
          {i.type === "price_mismatch" && i.observed_price != null && Math.abs(i.observed_price - i.approved_price) > 0.001 && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[.07] px-3 py-1.5 text-xs text-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>
                <span className="font-semibold text-rose-100">Potential overcharge: {money(Math.abs(i.observed_price - i.approved_price))} per transaction</span>
                <span className="ml-1 text-rose-300/70">· store count in Decision Receipt</span>
              </span>
            </div>
          )}
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

      {/* Channel Evidence table — row-level verification status for each
          channel involved in this incident's action. */}
      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Channel Evidence</h3>
          <span className="ml-auto text-[10px] uppercase tracking-[.18em] text-slate-500">
            Approved {money(i.approved_price)}
          </span>
        </div>
        <div className="divide-y divide-white/[.06] rounded-xl border border-white/8 overflow-hidden">
          {(["esl", "pos", "ecommerce"] as const).map((ch) => {
            const cv = i.channels.find((c) => c.channel === ch);
            if (!cv) return null;
            const isVerified = cv.status === "verified";
            const isMismatch = cv.status === "mismatch";
            const isTimeout = cv.status === "timeout";
            const label = ch === "esl" ? "Shelf label (ESL)" : ch === "pos" ? "POS checkout" : "Ecommerce";
            return (
              <div key={ch} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="w-36 shrink-0 text-slate-400">{label}</span>
                <span className="font-mono tabular-nums text-white">
                  {cv.observed_price != null ? money(cv.observed_price) : "—"}
                </span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.18em]",
                    isVerified
                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                      : isMismatch
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                        : "border-amber-500/35 bg-amber-500/10 text-amber-200",
                  )}
                >
                  {isVerified ? (
                    <CheckCircle className="h-2.5 w-2.5" />
                  ) : isMismatch ? (
                    <XCircle className="h-2.5 w-2.5" />
                  ) : (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  )}
                  {isVerified ? "Verified" : isMismatch ? "Mismatch" : isTimeout ? "Timeout" : cv.status}
                </span>
                {isMismatch && cv.observed_price != null && (
                  <span className="ml-auto text-[11px] text-rose-300/80 font-mono tabular-nums">
                    {cv.observed_price > i.approved_price ? "+" : ""}
                    {money(cv.observed_price - i.approved_price)} vs approved
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Full causal chain and per-channel receipt in{" "}
          <Link href={`/operations/receipts/${i.action_id}`} className="text-orange-300/80 underline-offset-2 hover:text-orange-300 hover:underline">
            Decision Receipt →
          </Link>
        </p>
      </section>

      {/* Execution Measurement Eligibility — derived read-only state.
          Distinct from the rollout-expansion decision shown elsewhere. */}
      <section aria-label="Sell-through measurement gate">
        <p className="mb-2 text-[10px] uppercase tracking-[.22em] text-slate-500">Sell-through measurement</p>
        <EligibilityPanel eligibility={i.measurement_eligibility} />
      </section>

      {/* Decision Receipt — the full causal chain for this action. */}
      <Link
        href={`/operations/receipts/${i.action_id}`}
        className="group flex items-center justify-between gap-3 rounded-2xl border border-orange-400/25 bg-orange-500/[.05] px-5 py-4 transition hover:border-orange-400/45 hover:bg-orange-500/[.08]"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <FileCheck2 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">View Decision Receipt</span>
            <span className="block text-xs text-slate-400">
              Trace the full chain — Signal → Match → Approved → Certified → Published → Verified →
              Measured → Learned.
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-orange-300 transition group-hover:translate-x-0.5" />
      </Link>

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

      {/* ── Recovery workspace ──────────────────────────────────────────
          The operator's command surface for this incident. When live, a
          labelled action toolbar + the field-verification panel; once
          resolved, a verified confirmation. The session-notes scratchpad
          stays available either way (notes are a working aid, not a write
          path). Every action re-fetches the incident view, so the Channel
          Evidence table, POS receipt and measurement gate above re-render
          to reflect the new state. */}
      {resolved ? (
        <section className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-verified" />
          <div className="text-sm">
            <div className="font-medium text-verified">
              {i.status === "rolled_back"
                ? "Shelf label rolled back — incident closed"
                : `${(i.offending_channel ?? "channel").toUpperCase()} verified at ${money(i.approved_price)}`}
            </div>
            <div className="text-xs text-slate-400">
              Recovery actions are closed for this incident. The audit timeline below is preserved.
            </div>
          </div>
        </section>
      ) : (
        <section className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Recovery Actions</h3>
            <span className="ml-auto text-[10px] uppercase tracking-[.18em] text-slate-500">
              Operator-gated · audited
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <ActionButton
              primary
              icon={RotateCcw}
              label={retryLabel}
              loading={busy === "retry"}
              disabled={busy !== null}
              onClick={() => setConfirmRetry(true)}
            />
            <ActionButton
              icon={Undo2}
              label="Roll Back Action"
              loading={busy === "rollback"}
              disabled={busy !== null}
              onClick={() => setConfirmRollback(true)}
            />
            <ActionButton
              icon={ClipboardList}
              label="Assign Human Verification"
              loading={busy === "task"}
              disabled={busy !== null || storeTask !== null}
              onClick={() => act("task")}
            />
            <ActionButton
              icon={UserCheck}
              label="Mark Verification Complete"
              loading={busy === "complete"}
              disabled={busy !== null || storeTask === null}
              onClick={() => act("complete")}
            />
            <ActionButton
              icon={CheckCircle2}
              label="Resolve"
              loading={busy === "resolve"}
              disabled={busy !== null}
              onClick={() => setConfirmResolve(true)}
            />
          </div>

          {/* Field-verification task — appears once dispatched this session.
              The "Mark Verification Complete" button above closes it. */}
          {storeTask && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/[.06] px-4 py-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-200">
                <ClipboardList className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-violet-100">Field verification dispatched</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.18em] text-violet-200">
                    Open · Store {storeTask.store_id}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{storeTask.instruction}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Confirm once the associate verifies the shelf — that re-reconciles the action and
                  closes the incident if every channel agrees.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Operator notes — session-only scratchpad. Clearly labelled as
          NOT persisted: there is no backend note endpoint, so these are a
          working aid for the current session only. */}
      <section className="glass rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Operator Notes</h3>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.18em] text-slate-400">
            Session note · not persisted
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNote();
              }
            }}
            placeholder="Add a working note (visible this session only)…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[.03] px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-brand-400/50 focus:bg-white/[.05]"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={!noteDraft.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {notes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 rounded-xl border border-white/[.06] bg-white/[.02] px-3.5 py-2.5"
              >
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-slate-200">{n.text}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {new Date(n.at).toLocaleTimeString()} · session note
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmRollback}
        title="Roll back the shelf label?"
        body={
          <>
            This will overwrite the shelf-label price to match the checkout
            POS. The acknowledgement is audited as an operator action — it
            does NOT change the approved price, so the next batch will
            re-attempt the original markdown.
          </>
        }
        confirmLabel="Roll back label"
        variant="danger"
        busy={busy === "rollback"}
        onCancel={() => setConfirmRollback(false)}
        onConfirm={() => act("rollback")}
      />

      <ConfirmDialog
        open={confirmRetry}
        title={`Re-push the ${offendingLabel.toLowerCase()} update?`}
        body={
          <>
            This re-dispatches the approved price ({money(i.approved_price)}) to{" "}
            {offendingLabel} and re-reconciles all channels. If they now agree,
            the incident clears and the measurement gate flips to eligible.
          </>
        }
        confirmLabel="Re-push update"
        variant="neutral"
        busy={busy === "retry"}
        onCancel={() => setConfirmRetry(false)}
        onConfirm={() => act("retry")}
      />

      <ConfirmDialog
        open={confirmResolve}
        title="Resolve this incident?"
        body={
          <>
            Resolving re-verifies every channel first. If they still disagree
            the resolve is rejected — retry the failing channel or assign a
            field verification before closing.
          </>
        }
        confirmLabel="Resolve incident"
        variant="neutral"
        busy={busy === "resolve"}
        onCancel={() => setConfirmResolve(false)}
        onConfirm={() => act("resolve")}
      />

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
        "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        primary
          ? "bg-gradient-to-r from-brand to-brand-600 text-white shadow-glow-brand hover:brightness-110"
          : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
      )}
    >
      <Icon className={clsx("h-4 w-4 shrink-0", loading && "animate-spin")} />
      <span className="leading-tight">{label}</span>
    </button>
  );
}

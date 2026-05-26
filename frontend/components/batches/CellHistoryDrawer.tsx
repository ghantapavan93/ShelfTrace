"use client";

/**
 * CellHistoryDrawer — slide-in panel that exposes the full delivery
 * story behind one matrix cell on /operations/batches/{id}.
 *
 * What it shows:
 *   1. Header — product, store, channel, decision pill
 *   2. Price comparison — expected vs observed, with delta
 *   3. Timeline — every audit event tagged with this channel,
 *      chronologically, with actor + relative timestamp
 *   4. Receipt evidence — raw_payload_json from the channel adapter
 *      (collapsible, mono-fonted, scrollable)
 *   5. Delivery metadata — attempts, created/updated, delivery_id
 *
 * Interaction:
 *   • Slides in from the right on desktop (≥ 768px)
 *   • Becomes a bottom sheet on mobile, draggable to dismiss
 *   • Escape key + backdrop click both close
 *   • Backdrop is a soft scrim (not opaque) so the matrix stays visible
 *   • Loading skeleton while the fetch is in flight
 *   • Empty/error states get explicit copy, not silent blanks
 *   • prefers-reduced-motion: panel just fades; no slide
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  X,
  ScanLine,
  Tag as TagIcon,
  Globe,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Activity,
  FileText,
  ChevronDown,
} from "lucide-react";
import { EASE } from "@/lib/motion";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

type Channel = "pos" | "esl" | "ecommerce";

const CHANNEL_META: Record<Channel, { icon: typeof ScanLine; label: string }> = {
  pos: { icon: ScanLine, label: "POS Checkout" },
  esl: { icon: TagIcon, label: "ESL Shelf" },
  ecommerce: { icon: Globe, label: "Ecommerce" },
};

interface Props {
  externalId: string;
  actionId: string | null;
  channel: Channel | null;
  isOpen: boolean;
  onClose: () => void;
}

type History = Awaited<ReturnType<typeof api.channelHistory>>;

export function CellHistoryDrawer({ externalId, actionId, channel, isOpen, onClose }: Props) {
  const reduced = useReducedMotion();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Fetch when open + selection changes
  useEffect(() => {
    if (!isOpen || !actionId || !channel) {
      setData(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    setPayloadOpen(false);
    api
      .channelHistory(externalId, actionId, channel)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, externalId, actionId, channel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />

          {/* Panel — slide from right on desktop, slide up on mobile */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Channel delivery history"
            initial={reduced ? false : { x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { x: "100%", opacity: 0 }}
            transition={{ duration: 0.34, ease: EASE.outQuart }}
            className={clsx(
              "fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[640px] flex-col overflow-hidden",
              "border-l border-white/10 bg-[#0a0e18] shadow-[-12px_0_40px_rgba(0,0,0,.5)]",
            )}
          >
            <DrawerHeader channel={channel} data={data} onClose={onClose} />

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <ErrorBanner message={error} />
              )}
              {loading && !error && <LoadingSkeleton />}
              {!loading && !error && data && (
                <DrawerBody
                  data={data}
                  channel={channel!}
                  payloadOpen={payloadOpen}
                  setPayloadOpen={setPayloadOpen}
                  reduced={!!reduced}
                />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────────

function DrawerHeader({
  channel,
  data,
  onClose,
}: {
  channel: Channel | null;
  data: History | null;
  onClose: () => void;
}) {
  const meta = channel ? CHANNEL_META[channel] : null;
  const Icon = meta?.icon ?? ScanLine;
  const productName = data?.action.product_name ?? "Loading…";
  const storeId = data?.action.store_id;
  const sku = data?.action.sku;

  return (
    <div className="border-b border-white/[.06] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-brand-400">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-brand-400">
              {meta?.label ?? "Channel"} · delivery history
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-white">{productName}</h2>
            {storeId && sku && (
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                <span className="mono">{sku}</span> · Store {storeId}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Body
// ────────────────────────────────────────────────────────────────────────

function DrawerBody({
  data,
  channel,
  payloadOpen,
  setPayloadOpen,
  reduced,
}: {
  data: History;
  channel: Channel;
  payloadOpen: boolean;
  setPayloadOpen: (b: boolean) => void;
  reduced: boolean;
}) {
  const { action, delivery, receipt, audit_events, note } = data;

  // Compute delta in dollars
  const expected = receipt?.expected_price ?? action.approved_price;
  const observed = receipt?.observed_price;
  const delta = observed !== null && observed !== undefined ? observed - expected : null;
  const verdictTone =
    receipt?.status === "verified"
      ? "emerald"
      : receipt?.status === "mismatch"
        ? "rose"
        : receipt?.status === "timeout"
          ? "amber"
          : "slate";

  return (
    <div className="space-y-5">
      {/* Price comparison */}
      <section>
        <SectionHeader icon={Activity} label="Price verdict" tone={verdictTone} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PriceTile label="Approved" value={expected} tone="brand" />
          <PriceTile
            label={receipt?.status === "timeout" ? "POS no-ack" : "Observed"}
            value={observed}
            tone={
              observed === null || observed === undefined
                ? "slate"
                : verdictTone === "emerald"
                  ? "emerald"
                  : verdictTone === "rose"
                    ? "rose"
                    : "amber"
            }
          />
          <PriceTile
            label="Delta"
            value={delta !== null ? delta : null}
            tone={delta !== null && Math.abs(delta) < 0.005 ? "emerald" : delta !== null ? "rose" : "slate"}
            isDelta
          />
        </div>
        {receipt?.status === "mismatch" && observed !== null && observed !== undefined && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/[.05] px-3 py-2 text-xs text-rose-200">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Shopper-facing channel reported a different price than the approved value. Until acknowledged, this action is
            ineligible for downstream performance measurement.
          </div>
        )}
        {receipt?.status === "timeout" && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[.05] px-3 py-2 text-xs text-amber-200">
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            Channel did not acknowledge the dispatch within the SLA window. Retry the delivery or open the incident to triage.
          </div>
        )}
      </section>

      {/* Delivery metadata */}
      {delivery && (
        <section>
          <SectionHeader icon={Clock} label="Delivery" tone="slate" />
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <MetaPair k="Attempts" v={String(delivery.attempts)} />
            <MetaPair k="Status" v={delivery.status} />
            <MetaPair k="Dispatched" v={formatRelative(delivery.created_at)} />
            <MetaPair k="Last update" v={formatRelative(delivery.updated_at)} />
          </div>
        </section>
      )}

      {/* Note — for empty-state cases */}
      {note && !delivery && (
        <div className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-slate-400">
          {note}
        </div>
      )}

      {/* Audit timeline */}
      <section>
        <SectionHeader
          icon={Activity}
          label={`Audit timeline (${audit_events.length})`}
          tone="violet"
        />
        {audit_events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-slate-500">
            No audit events tagged with the <span className="mono">{channel}</span> channel for this action yet.
          </div>
        ) : (
          <ol className="relative space-y-2.5 border-l border-white/[.08] pl-5">
            {audit_events.map((evt, i) => (
              <TimelineItem key={evt.id} evt={evt} idx={i} reduced={reduced} />
            ))}
          </ol>
        )}
      </section>

      {/* Raw receipt payload — collapsible */}
      {receipt?.raw_payload_json && Object.keys(receipt.raw_payload_json).length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setPayloadOpen(!payloadOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.02] px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-white/[.04]"
            aria-expanded={payloadOpen}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium uppercase tracking-[.18em]">Raw receipt payload</span>
              <span className="text-[10px] text-slate-500">
                {Object.keys(receipt.raw_payload_json).length} keys
              </span>
            </span>
            <ChevronDown
              className={clsx(
                "h-3.5 w-3.5 text-slate-500 transition-transform",
                payloadOpen && "rotate-180",
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {payloadOpen && (
              <motion.pre
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.24, ease: EASE.outQuart }}
                className="mono mt-2 overflow-hidden whitespace-pre-wrap break-all rounded-xl border border-white/[.06] bg-black/40 px-3 py-3 text-[11px] leading-relaxed text-slate-300"
              >
                {JSON.stringify(receipt.raw_payload_json, null, 2)}
              </motion.pre>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Footer context — links to the relevant operational surface */}
      <section className="rounded-xl border border-white/[.06] bg-white/[.015] px-3 py-3 text-[11px] text-slate-500">
        Action <span className="mono text-slate-300">{action.id}</span> ·
        reason <span className="text-slate-300">{action.reason}</span> · decision{" "}
        <span className="text-slate-300">{action.decision}</span>
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Small parts
// ────────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  tone: "emerald" | "rose" | "amber" | "slate" | "violet" | "brand";
}) {
  const toneClass = {
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    amber: "text-amber-300",
    slate: "text-slate-400",
    violet: "text-violet-300",
    brand: "text-brand-400",
  }[tone];
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
      <Icon className={clsx("h-3 w-3", toneClass)} />
      <span>{label}</span>
    </div>
  );
}

function PriceTile({
  label,
  value,
  tone,
  isDelta,
}: {
  label: string;
  value: number | null | undefined;
  tone: "brand" | "emerald" | "rose" | "amber" | "slate";
  isDelta?: boolean;
}) {
  const toneClass = {
    brand: "border-brand/25 bg-brand/[.04] text-brand-400",
    emerald: "border-emerald-500/25 bg-emerald-500/[.04] text-emerald-200",
    rose: "border-rose-500/30 bg-rose-500/[.05] text-rose-200",
    amber: "border-amber-500/25 bg-amber-500/[.04] text-amber-200",
    slate: "border-white/10 bg-white/[.02] text-slate-400",
  }[tone];
  const display =
    value === null || value === undefined
      ? "—"
      : isDelta
        ? `${value >= 0 ? "+" : ""}${money(value)}`
        : money(value);
  return (
    <div className={clsx("rounded-xl border px-3 py-3", toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-[.18em] opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{display}</div>
    </div>
  );
}

function MetaPair({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[.18em] text-slate-500">{k}</div>
      <div className="mono mt-0.5 text-sm text-slate-200">{v}</div>
    </div>
  );
}

function TimelineItem({
  evt,
  idx,
  reduced,
}: {
  evt: { id: string; event: string; detail: string; actor: string; created_at: string | null };
  idx: number;
  reduced: boolean;
}) {
  // Color the dot based on the event type
  const isFailure = /mismatch|incident|timeout|failed/i.test(evt.event + " " + evt.detail);
  const isRecovery = /retry|recover|resolved|verified|ack/i.test(evt.event);
  const dotTone = isFailure ? "bg-rose-400" : isRecovery ? "bg-emerald-400" : "bg-violet-400";

  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, delay: idx * 0.04, ease: EASE.outQuart }}
      className="relative"
    >
      <span
        className={clsx(
          "absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0a0e18]",
          dotTone,
        )}
      />
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="mono text-[11px] font-semibold uppercase tracking-wide text-white">
          {evt.event}
        </span>
        <span className="text-[10px] text-slate-500">{formatRelative(evt.created_at)}</span>
        <span className="rounded-full border border-white/10 bg-white/[.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
          {evt.actor}
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-400">{evt.detail}</p>
    </motion.li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-white/[.04]" />
        <div className="h-20 animate-pulse rounded-xl bg-white/[.04]" />
        <div className="h-20 animate-pulse rounded-xl bg-white/[.04]" />
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-white/[.04]" />
      <div className="h-40 animate-pulse rounded-xl bg-white/[.04]" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/[.04] px-3 py-3 text-sm text-rose-200">
      <AlertCircle className="mr-1.5 inline h-4 w-4" />
      Could not load delivery history: {message}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

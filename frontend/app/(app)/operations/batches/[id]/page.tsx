"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  ArrowLeft,
  Rocket,
  Search,
  Store,
  ShieldCheck,
  FileCheck2,
} from "lucide-react";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { DetailSkeleton } from "@/components/Skeleton";
import { CellHistoryDrawer } from "@/components/batches/CellHistoryDrawer";
import { useWorkMode } from "@/components/ModeProvider";
import { FlaskConical } from "lucide-react";
import type { BatchDetail, ChannelView } from "@/lib/types";

function Cell({
  c,
  onClick,
}: {
  c: ChannelView | undefined;
  onClick?: () => void;
}) {
  if (!c) return <td className="px-4 py-3 text-slate-600">—</td>;
  const cls =
    c.status === "verified"
      ? "text-verified"
      : c.status === "mismatch"
        ? "text-danger text-glow-danger"
        : c.status === "timeout"
          ? "text-warn"
          : "text-slate-400";
  const label = {
    verified: "Verified",
    mismatch: "Mismatch",
    timeout: "No ack",
    pending: "Pending",
  }[c.status];
  const isInteractive = !!onClick;
  return (
    <td className="px-2 py-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!isInteractive}
        title={isInteractive ? "Open delivery history" : undefined}
        className={clsx(
          "w-full rounded-lg px-2 py-2 text-left transition",
          isInteractive
            ? "cursor-pointer hover:bg-white/[0.04] hover:ring-1 hover:ring-white/15 focus:outline-none focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-brand/50"
            : "cursor-default",
        )}
      >
        <div className={clsx("font-semibold tabular-nums", cls)}>
          {c.status === "timeout"
            ? money(c.expected_price)
            : money(c.observed_price ?? c.expected_price)}
        </div>
        <div className={clsx("text-[11px]", cls)}>{label}</div>
      </button>
    </td>
  );
}

type GroupBy = "none" | "store";

// ── Per-channel verification health ──────────────────────────────────────
const CHANNEL_META: Record<string, { label: string; sub: string }> = {
  pos: { label: "POS Checkout", sub: "Register price" },
  esl: { label: "ESL Shelf", sub: "Shelf label ack" },
  ecommerce: { label: "Ecommerce", sub: "Online listing" },
};

const STATUS_TONE: Record<
  ChannelView["status"],
  { bar: string; text: string; label: string }
> = {
  verified: { bar: "bg-emerald-400", text: "text-verified", label: "Verified" },
  mismatch: { bar: "bg-rose-400", text: "text-danger", label: "Mismatch" },
  timeout: { bar: "bg-amber-400", text: "text-warn", label: "No ack" },
  pending: { bar: "bg-slate-500", text: "text-slate-400", label: "Pending" },
};

const STATUS_ORDER: ChannelView["status"][] = [
  "verified",
  "mismatch",
  "timeout",
  "pending",
];

function ChannelHealthStrip({ actions }: { actions: BatchDetail["actions"] }) {
  const summary = useMemo(() => {
    const channels: ChannelView["channel"][] = ["pos", "esl", "ecommerce"];
    return channels
      .map((name) => {
        const cells = actions
          .map((a) => a.channels.find((c) => c.channel === name))
          .filter((c): c is ChannelView => !!c);
        const counts: Record<ChannelView["status"], number> = {
          verified: 0,
          mismatch: 0,
          timeout: 0,
          pending: 0,
        };
        cells.forEach((c) => {
          counts[c.status] += 1;
        });
        const total = cells.length;
        const verifiedPct = total
          ? Math.round((counts.verified / total) * 100)
          : 0;
        return { name, counts, total, verifiedPct };
      })
      .filter((s) => s.total > 0);
  }, [actions]);

  if (summary.length === 0) return null;

  return (
    <div>
      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">
        Channel health
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {summary.map((s) => {
          const meta = CHANNEL_META[s.name];
          const allClear = s.counts.verified === s.total;
          const hasDanger = s.counts.mismatch > 0;
          return (
            <div
              key={s.name}
              className={clsx(
                "rounded-2xl border bg-[#0a0e18]/60 p-4 transition",
                hasDanger
                  ? "border-rose-500/25 shadow-glow-danger"
                  : allClear
                    ? "border-emerald-500/20 shadow-glow-verified"
                    : "border-white/10",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {meta.label}
                  </div>
                  <div className="text-[10px] uppercase tracking-[.16em] text-slate-500">
                    {meta.sub}
                  </div>
                </div>
                <div
                  className={clsx(
                    "mono text-lg font-bold tabular-nums",
                    allClear ? "text-verified" : hasDanger ? "text-danger" : "text-white",
                  )}
                >
                  {s.verifiedPct}%
                </div>
              </div>
              {/* Stacked share of each reconciliation state */}
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-white/5">
                {STATUS_ORDER.map((st) =>
                  s.counts[st] > 0 ? (
                    <div
                      key={st}
                      className={STATUS_TONE[st].bar}
                      style={{ width: `${(s.counts[st] / s.total) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((st) =>
                  s.counts[st] > 0 ? (
                    <span
                      key={st}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                        STATUS_TONE[st].text,
                      )}
                    >
                      <span
                        className={clsx(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_TONE[st].bar,
                        )}
                      />
                      {s.counts[st]} {STATUS_TONE[st].label}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BatchPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: b, error, reload } = useLive<BatchDetail>(
    () => api.batch(id),
    [id],
  );
  const [expanding, setExpanding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";

  // Cell-history drawer state — populated when a user clicks any matrix cell
  const [selectedCell, setSelectedCell] = useState<{
    actionId: string;
    channel: "pos" | "esl" | "ecommerce";
  } | null>(null);

  // Default to grouped-by-store when there are >= 12 actions
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  async function expand() {
    setExpanding(true);
    setMsg(null);
    try {
      await api.expand(id);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setExpanding(false);
    }
  }

  const ch = (
    a: BatchDetail["actions"][number],
    name: string,
  ) => a.channels.find((c) => c.channel === name);

  const filteredActions = useMemo(() => {
    if (!b) return [];
    const q = search.trim().toLowerCase();
    if (!q) return b.actions;
    return b.actions.filter(
      (a) =>
        a.product_name.toLowerCase().includes(q) ||
        a.sku.toLowerCase().includes(q) ||
        a.store_id.toLowerCase().includes(q),
    );
  }, [b, search]);

  const groupedActions = useMemo(() => {
    if (groupBy !== "store") return null;
    const map = new Map<string, typeof filteredActions>();
    for (const a of filteredActions) {
      if (!map.has(a.store_id)) map.set(a.store_id, []);
      map.get(a.store_id)!.push(a);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredActions, groupBy]);

  if (error)
    return (
      <div className="glass rounded-2xl p-6 text-slate-300">
        Batch not found.
      </div>
    );
  if (!b) return <DetailSkeleton />;

  const isLarge = b.actions.length >= 12;
  // When a Live-mode user explicitly opens the demo batch, the Realistic
  // Scale catalog, or a certification sandbox run, surface a small chip
  // so they know what they're viewing — this is the documented
  // "explicit escape hatch" path.
  const viewingDemoFromLive =
    isLiveWorkMode &&
    (b.external_id === DEMO_BATCH ||
      b.external_id === "realistic-scale-catalog" ||
      b.external_id.startsWith("certification-"));

  return (
    <div className="space-y-6">
      {/* Top breadcrumb + header */}
      <div>
        <Link
          href={`/operations?external_id=${b.external_id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-3 w-3" /> Back to command center
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">
                {b.name} — {b.zone}
              </h1>
              {viewingDemoFromLive && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.18em] text-violet-200">
                  <FlaskConical className="h-2.5 w-2.5" />
                  {b.external_id === DEMO_BATCH
                    ? "Demo batch"
                    : b.external_id === "realistic-scale-catalog"
                      ? "Realistic Scale demo"
                      : "Cert sandbox"}
                  <span className="text-violet-300/70">· Live mode</span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-400">
              External ID{" "}
              <span className="mono text-slate-300">{b.external_id}</span> ·
              approved by{" "}
              <span className="text-slate-300">{b.approved_by}</span>
            </p>
          </div>
          <StatusPill value={b.status} label={b.status.replace(/_/g, " ")} />
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        <Tile v={b.total_actions} l="Total actions" />
        <Tile
          v={`${b.canary_store_ids.length}`}
          l="Canary stores"
          s={b.canary_store_ids.join(", ")}
        />
        <Tile
          v={`${b.expansion_store_ids.length}`}
          l="Expansion stores"
          s={b.expansion_store_ids.join(", ")}
        />
        <Tile v={b.critical_incidents} l="Critical" tone="danger" />
        <Tile v={b.deadline_risks} l="Deadline risk" tone="warn" />
        <Tile
          v={b.expansion_blocked ? "Blocked" : "Clear"}
          l="Expansion"
          tone={b.expansion_blocked ? "danger" : "verified"}
        />
      </div>

      {/* Per-channel verification health — derived client-side from the
          batch's actions. Shows, for each delivery channel, how many of its
          cells landed in each reconciliation state. Makes the bottleneck
          channel obvious at a glance before you scan the full matrix. */}
      <ChannelHealthStrip actions={b.actions} />

      {b.block_reason && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          {b.block_reason}
        </div>
      )}

      {b.status === "ready_for_expansion" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="text-sm text-emerald-200">
            All canary actions verified. Safe to expand to{" "}
            {b.expansion_store_ids.length} remaining store(s):{" "}
            <span className="mono">{b.expansion_store_ids.join(", ")}</span>.
          </div>
          <button
            onClick={expand}
            disabled={expanding}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110 disabled:opacity-50"
          >
            <Rocket
              className={clsx("h-4 w-4", expanding && "animate-pulse")}
            />
            {expanding ? "Expanding…" : "Expand to remaining stores"}
          </button>
        </div>
      )}
      {b.status === "completed" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Rollout completed — all {b.total_store_count} stores verified
          across every channel.
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          {msg}
        </div>
      )}

      {/* Verification matrix with search + grouping for large batches */}
      <div className="holo-card overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Verification Matrix
              <span className="ml-2 font-normal text-slate-500">
                · {filteredActions.length} of {b.actions.length}
              </span>
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Click any channel cell to open its full delivery history.
              <span className="ml-2 md:hidden">Swipe horizontally to see all channels.</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, SKU, store…"
                className="w-56 rounded-lg border border-white/10 bg-black/30 py-1.5 pl-7 pr-2 text-xs text-white outline-none focus:border-brand/50"
              />
            </div>
            {isLarge && (
              <div className="inline-flex rounded-lg border border-white/10 bg-white/[.04] p-0.5 text-xs">
                <button
                  onClick={() => setGroupBy("none")}
                  className={clsx(
                    "rounded-md px-2 py-1 transition",
                    groupBy === "none"
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  Flat
                </button>
                <button
                  onClick={() => setGroupBy("store")}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 transition",
                    groupBy === "store"
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  <Store className="h-3 w-3" /> By store
                </button>
              </div>
            )}
          </div>
        </div>

        {filteredActions.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            No actions match "<span className="text-slate-300">{search}</span>"
            in this batch.
          </div>
        ) : groupedActions ? (
          <div className="divide-y divide-white/[.04]">
            {groupedActions.map(([storeId, rows]) => (
              <div key={storeId}>
                <div className="flex items-center gap-2 bg-white/[.02] px-5 py-2 text-[10px] uppercase tracking-[.18em] text-slate-500">
                  <Store className="h-3 w-3" />
                  Store {storeId}
                  <span className="ml-auto text-slate-600">
                    {rows.length} action{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <MatrixRows
                  rows={rows}
                  ch={ch}
                  onCellClick={(actionId, channel) => setSelectedCell({ actionId, channel })}
                />
              </div>
            ))}
          </div>
        ) : (
          <MatrixRows
            rows={filteredActions}
            ch={ch}
            onCellClick={(actionId, channel) => setSelectedCell({ actionId, channel })}
          />
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <Legend color="bg-verified" label="Verified" />
        <Legend color="bg-warn" label="Timeout / Pending" />
        <Legend color="bg-danger" label="Mismatch / Blocked" />
        <Link
          href="/engineering"
          className="ml-auto inline-flex items-center gap-1 text-brand-400 hover:underline"
        >
          View engineering trace <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Side drawer with full delivery history for the clicked cell */}
      <CellHistoryDrawer
        externalId={id}
        actionId={selectedCell?.actionId ?? null}
        channel={selectedCell?.channel ?? null}
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
      />
    </div>
  );
}

function MatrixRows({
  rows,
  ch,
  onCellClick,
}: {
  rows: BatchDetail["actions"];
  ch: (
    a: BatchDetail["actions"][number],
    name: string,
  ) => ChannelView | undefined;
  onCellClick?: (actionId: string, channel: "pos" | "esl" | "ecommerce") => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr className="border-b border-white/5">
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium">Store</th>
            <th className="px-4 py-3 font-medium">POS Checkout</th>
            <th className="px-4 py-3 font-medium">ESL Shelf</th>
            <th className="px-4 py-3 font-medium">Ecommerce</th>
            <th className="px-4 py-3 font-medium">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr
              key={a.id}
              className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-white">{a.product_name}</div>
                <div className="text-[11px] text-slate-500">
                  {a.sku} · {a.reason}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-300">{a.store_id}</td>
              <Cell c={ch(a, "pos")} onClick={onCellClick ? () => onCellClick(a.id, "pos") : undefined} />
              <Cell c={ch(a, "esl")} onClick={onCellClick ? () => onCellClick(a.id, "esl") : undefined} />
              <Cell c={ch(a, "ecommerce")} onClick={onCellClick ? () => onCellClick(a.id, "ecommerce") : undefined} />
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <StatusPill value={a.decision} />
                  <Link
                    href={`/operations/receipts/${a.id}`}
                    title="View Decision Receipt"
                    aria-label={`Decision Receipt for ${a.product_name}`}
                    className="text-slate-500 transition hover:text-orange-300"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({
  v,
  l,
  s,
  tone = "default",
}: {
  v: React.ReactNode;
  l: string;
  s?: string;
  tone?: string;
}) {
  const cls =
    { default: "text-white", danger: "text-danger", warn: "text-warn", verified: "text-verified" }[tone] ?? "text-white";
  return (
    <div className="glass rounded-xl px-3 py-3">
      <div className={clsx("text-xl font-bold", cls)}>{v}</div>
      <div className="text-xs text-slate-400">{l}</div>
      {s && <div className="mono mt-0.5 truncate text-[10px] text-slate-500">{s}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx("h-2 w-2 rounded-full", color)} /> {label}
    </span>
  );
}

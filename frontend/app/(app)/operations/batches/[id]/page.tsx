"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ArrowRight, Rocket } from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import type { BatchDetail, ChannelView } from "@/lib/types";

function Cell({ c }: { c: ChannelView | undefined }) {
  if (!c) return <td className="px-4 py-3 text-slate-600">—</td>;
  const cls =
    c.status === "verified"
      ? "text-verified"
      : c.status === "mismatch"
        ? "text-danger text-glow-danger"
        : c.status === "timeout"
          ? "text-warn"
          : "text-slate-400";
  const label = { verified: "Verified", mismatch: "Mismatch", timeout: "No ack", pending: "Pending" }[c.status];
  return (
    <td className="px-4 py-3">
      <div className={clsx("font-semibold tabular-nums", cls)}>
        {c.status === "timeout" ? money(c.expected_price) : money(c.observed_price ?? c.expected_price)}
      </div>
      <div className={clsx("text-[11px]", cls)}>{label}</div>
    </td>
  );
}

export default function BatchPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: b, error, reload } = useLive<BatchDetail>(() => api.batch(id), [id]);
  const [expanding, setExpanding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  if (error) return <div className="glass rounded-2xl p-6 text-slate-300">Batch not found.</div>;
  if (!b) return <div className="text-slate-400">Loading batch…</div>;

  const ch = (a: BatchDetail["actions"][number], name: string) => a.channels.find((c) => c.channel === name);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{b.name} — {b.zone}</h1>
          <p className="text-sm text-slate-400">
            External ID <span className="mono text-slate-300">{b.external_id}</span> · approved by{" "}
            <span className="text-slate-300">{b.approved_by}</span>
          </p>
        </div>
        <StatusPill value={b.status} label={b.status.replace(/_/g, " ")} />
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        <Tile v={b.total_actions} l="Total actions" />
        <Tile v={`${b.canary_store_ids.length}`} l="Canary stores" s={b.canary_store_ids.join(", ")} />
        <Tile v={`${b.expansion_store_ids.length}`} l="Expansion stores" s={b.expansion_store_ids.join(", ")} />
        <Tile v={b.critical_incidents} l="Critical" tone="danger" />
        <Tile v={b.deadline_risks} l="Deadline risk" tone="warn" />
        <Tile v={b.expansion_blocked ? "Blocked" : "Clear"} l="Expansion" tone={b.expansion_blocked ? "danger" : "verified"} />
      </div>

      {b.block_reason && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          {b.block_reason}
        </div>
      )}

      {b.status === "ready_for_expansion" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="text-sm text-emerald-200">
            All canary actions verified. Safe to expand to {b.expansion_store_ids.length} remaining store(s):{" "}
            <span className="mono">{b.expansion_store_ids.join(", ")}</span>.
          </div>
          <button
            onClick={expand}
            disabled={expanding}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110 disabled:opacity-50"
          >
            <Rocket className={clsx("h-4 w-4", expanding && "animate-pulse")} />
            {expanding ? "Expanding…" : "Expand to remaining stores"}
          </button>
        </div>
      )}
      {b.status === "completed" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
          Rollout completed — all {b.total_store_count} stores verified across every channel.
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{msg}</div>
      )}

      {/* Canary verification matrix */}
      <div className="glass-strong overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">
          Canary Verification Matrix
        </div>
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
              {b.actions.map((a) => (
                <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{a.product_name}</div>
                    <div className="text-[11px] text-slate-500">{a.reason}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.store_id}</td>
                  <Cell c={ch(a, "pos")} />
                  <Cell c={ch(a, "esl")} />
                  <Cell c={ch(a, "ecommerce")} />
                  <td className="px-4 py-3">
                    <StatusPill value={a.decision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <Legend color="bg-verified" label="Verified" />
        <Legend color="bg-warn" label="Timeout / Pending" />
        <Legend color="bg-danger" label="Mismatch / Blocked" />
        <Link href="/engineering" className="ml-auto inline-flex items-center gap-1 text-brand-400 hover:underline">
          View engineering trace <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Tile({ v, l, s, tone = "default" }: { v: React.ReactNode; l: string; s?: string; tone?: string }) {
  const cls = { default: "text-white", danger: "text-danger", warn: "text-warn", verified: "text-verified" }[tone] ?? "text-white";
  return (
    <div className="glass rounded-xl px-3 py-3">
      <div className={clsx("text-xl font-bold", cls)}>{v}</div>
      <div className="text-xs text-slate-400">{l}</div>
      {s && <div className="mono mt-0.5 text-[10px] text-slate-500">{s}</div>}
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

"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  ScanLine,
  Tag,
  Globe,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  ArrowRight,
  Network,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { StatusPill } from "@/components/StatusPill";
import { DetailSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { CertificationCheck, CertificationReport } from "@/lib/types";

const CHECK_LABEL: Record<string, string> = {
  price_agreement: "Price Agreement",
  markdown_sla: "Markdown SLA",
  ecommerce_verification: "Ecommerce Verification",
  idempotent_batch: "Idempotent Batch",
  recovery_safety: "Recovery Safety",
  canary_protection: "Canary Protection",
};

function checkStatus(report: CertificationReport, type: string): CertificationCheck | undefined {
  return report.checks.find((c) => c.check_type === type);
}

function ChannelCard({
  icon: Icon,
  name,
  provider,
  status,
}: {
  icon: React.ElementType;
  name: string;
  provider: string;
  status?: string;
}) {
  const tone =
    status === "failed"
      ? "border-rose-500/40 bg-rose-500/5 text-danger"
      : status === "recovered"
        ? "border-amber-500/40 bg-amber-500/5 text-warn"
        : "border-emerald-500/30 bg-emerald-500/5 text-verified";
  const label =
    status === "failed" ? "Failed" : status === "recovered" ? "Recovered After Retry" : "Passed";
  return (
    <div className={clsx("rounded-2xl border px-4 py-4", tone)}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <Icon className="h-4 w-4" /> {name}
      </div>
      <div className="mt-2 text-sm font-medium text-white">{provider}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
    </div>
  );
}

export default function CertificationPage() {
  const { data, error, reload } = useLive<CertificationReport>(() => api.certificationCurrent());
  const [busy, setBusy] = useState<string | null>(null);

  async function reset() {
    setBusy("reset");
    try {
      await api.certificationReset();
      await reload();
    } finally {
      setBusy(null);
    }
  }
  async function rerun() {
    if (!data) return;
    setBusy("rerun");
    try {
      await api.certificationRerun(data.run_id);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return (
      <div className="glass rounded-2xl p-6 text-slate-300">
        Could not load certification. Try{" "}
        <button onClick={reset} className="text-brand-400 underline">
          Reset Certification Demo
        </button>
        .
        <div className="mt-1 text-xs text-slate-500">{error}</div>
      </div>
    );
  if (!data) return <DetailSkeleton />;

  const failed = data.status === "failed_pending_remediation";
  const passed = data.status === "passed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Connector Certification Lab</h1>
        <p className="mt-1 text-slate-400">
          Validate store-system reliability before automated price execution is enabled.
        </p>
      </div>

      {/* Status hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx(
          "relative overflow-hidden rounded-3xl border px-7 py-7",
          failed ? "border-rose-500/30 bg-gradient-to-br from-rose-950/30 via-ink-900 to-black" : "border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-ink-900 to-black",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {data.connector.name} · {data.connector.retailer_name}
            </div>
            <div className="mt-2 flex items-center gap-3">
              {failed ? (
                <ShieldAlert className="h-9 w-9 text-danger" />
              ) : (
                <ShieldCheck className="h-9 w-9 text-verified" />
              )}
              <h2 className={clsx("text-2xl font-bold", failed ? "text-danger text-glow-danger" : "text-verified")}>
                {failed ? "Failed Pending Remediation" : passed ? "Passed" : "Running"}
              </h2>
            </div>
            {data.final_recommendation && (
              <p className="mt-3 max-w-2xl text-sm text-slate-300">{data.final_recommendation}</p>
            )}
          </div>
          <div className="flex gap-2 text-center text-xs">
            <Stat v={data.summary.passed} l="Passed" cls="text-verified" />
            <Stat v={data.summary.recovered} l="Recovered" cls="text-warn" />
            <Stat v={data.summary.failed} l="Failed" cls="text-danger" />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <ChannelCard icon={ScanLine} name="POS Checkout" provider={data.connector.pos_provider} status={checkStatus(data, "price_agreement")?.status} />
          <ChannelCard icon={Tag} name="Shelf Labels" provider={data.connector.esl_provider} status={checkStatus(data, "markdown_sla")?.status} />
          <ChannelCard icon={Globe} name="Ecommerce" provider={data.connector.ecommerce_provider} status={checkStatus(data, "ecommerce_verification")?.status} />
        </div>
      </motion.section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={reset}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RotateCcw className={clsx("h-4 w-4", busy === "reset" && "animate-spin")} /> Reset Certification Demo
        </button>
        <button
          onClick={rerun}
          disabled={busy !== null || data.summary.failed === 0}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110 disabled:opacity-40"
        >
          <RefreshCw className={clsx("h-4 w-4", busy === "rerun" && "animate-spin")} /> Run Failed Checks Again
        </button>
        <Link
          href="/engineering?mode=certification"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          <Network className="h-4 w-4" /> View Engineering Evidence
        </Link>
        <Link
          href="/operations"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          Open Live Operations <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Reliability checks */}
      <div className="glass-strong overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">
          Reliability Checks
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-medium">Check</th>
                <th className="px-4 py-3 font-medium">Scenario</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.checks.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{CHECK_LABEL[c.check_type] ?? c.check_type}</td>
                  <td className="px-4 py-3 text-slate-300">{c.scenario_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {c.status === "failed" ? (
                        <AlertCircle className="h-4 w-4 text-danger" />
                      ) : (
                        <CheckCircle2 className={clsx("h-4 w-4", c.status === "recovered" ? "text-warn" : "text-verified")} />
                      )}
                      <StatusPill value={c.status} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{String(c.evidence.detail ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        Certification and live rollout run on the same reliability engine. These results are derived from real
        execution receipts, incidents, retries and audit records produced by the shared pipeline.
      </p>
    </div>
  );
}

function Stat({ v, l, cls }: { v: number; l: string; cls: string }) {
  return (
    <div className="glass rounded-xl px-4 py-2">
      <div className={clsx("text-2xl font-bold", cls)}>{v}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{l}</div>
    </div>
  );
}

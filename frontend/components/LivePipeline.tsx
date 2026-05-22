"use client";

import { motion } from "framer-motion";
import { PackageCheck, Store, ShieldCheck, ShieldX, Globe } from "lucide-react";
import clsx from "clsx";

const STAGES = [
  { n: 1, title: "Approved Batch", sub: "Approved upstream · ready for rollout", Icon: PackageCheck, tone: "sky" },
  { n: 2, title: "Canary Stores", sub: "First few stores · low-risk probe", Icon: Store, tone: "sky" },
  { n: 3, title: "POS / ESL / Ecommerce", sub: "Price, promo & display verified", Icon: ShieldCheck, tone: "violet" },
  { n: 4, title: "Block Risky Changes", sub: "Auto-hold & alert before expansion", Icon: ShieldX, tone: "danger" },
  { n: 5, title: "Recover & Expand", sub: "Auto rollback or safe expansion", Icon: Globe, tone: "sky" },
];

const TONE: Record<string, string> = {
  sky: "border-sky-500/30 text-sky-300 shadow-[0_0_30px_-10px_rgba(56,189,248,0.6)]",
  violet: "border-violet-500/40 text-violet-300 shadow-[0_0_30px_-8px_rgba(124,58,237,0.7)]",
  danger: "border-rose-500/50 text-danger shadow-glow-danger",
};

export function LivePipeline() {
  return (
    <div className="relative">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
        <span className="h-2 w-2 rounded-full bg-verified animate-pulse-glow" /> Live Execution Pipeline
      </div>
      <div className="relative flex flex-col gap-3 md:flex-row md:items-stretch">
        {STAGES.map((s, i) => (
          <div key={s.n} className="relative flex-1">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className={clsx("glass-strong relative h-full rounded-2xl border p-4", TONE[s.tone])}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-white">
                  {s.n}
                </span>
                <s.Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{s.title}</div>
              <div className="mt-1 text-[11px] leading-snug text-slate-400">{s.sub}</div>
              {/* animated base glow */}
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
                <div className="flow-thread h-full w-full rounded-full" />
              </div>
            </motion.div>
            {i < STAGES.length - 1 && (
              <div className="absolute -right-2 top-1/2 hidden h-px w-4 -translate-y-1/2 md:block">
                <div className="flow-thread h-[2px] w-full rounded-full" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-500">
        <span className="h-px w-10 bg-gradient-to-r from-transparent to-brand/50" />
        Continuous feedback &amp; learning
        <span className="h-px w-10 bg-gradient-to-l from-transparent to-brand/50" />
      </div>
    </div>
  );
}

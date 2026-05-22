"use client";

import { motion } from "framer-motion";
import { Globe, ScanLine, Tag, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import clsx from "clsx";
import { money } from "@/lib/format";
import type { ChannelView } from "@/lib/types";

const ICON = { esl: Tag, pos: ScanLine, ecommerce: Globe } as const;
const TITLE = { esl: "Shelf Label", pos: "Checkout POS", ecommerce: "Ecommerce" } as const;

function tone(status: string) {
  if (status === "verified")
    return {
      ring: "border-emerald-500/40",
      glow: "shadow-glow-verified",
      price: "text-verified text-glow-verified",
      base: "from-emerald-500/40",
      icon: CheckCircle2,
      iconCls: "text-verified",
      label: "Verified",
    };
  if (status === "mismatch")
    return {
      ring: "border-rose-500/50",
      glow: "shadow-glow-danger",
      price: "text-danger text-glow-danger",
      base: "from-rose-500/50",
      icon: AlertCircle,
      iconCls: "text-danger",
      label: "Mismatch",
    };
  if (status === "timeout")
    return {
      ring: "border-amber-500/50",
      glow: "",
      price: "text-warn",
      base: "from-amber-500/40",
      icon: Clock,
      iconCls: "text-warn",
      label: "No Acknowledgement",
    };
  return {
    ring: "border-white/15",
    glow: "",
    price: "text-slate-300",
    base: "from-slate-500/30",
    icon: Clock,
    iconCls: "text-slate-400",
    label: "Pending",
  };
}

export function ChannelPedestal({ channel, index = 0 }: { channel: ChannelView; index?: number }) {
  const Icon = ICON[channel.channel];
  const t = tone(channel.status);
  const StatusIcon = t.icon;
  const display = channel.status === "timeout" ? channel.expected_price : channel.observed_price ?? channel.expected_price;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.5 }}
      className="relative flex flex-col items-center"
    >
      <div
        className={clsx(
          "glass-strong relative w-full rounded-2xl border px-5 py-5 text-center",
          t.ring,
          t.glow,
        )}
      >
        <div className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
          <Icon className="h-4 w-4" /> {TITLE[channel.channel]}
        </div>
        <div className={clsx("text-4xl font-bold tabular-nums", t.price)}>
          {channel.status === "timeout" ? money(channel.expected_price) : money(display)}
        </div>
        <div className={clsx("mt-2 flex items-center justify-center gap-1.5 text-xs font-medium", t.iconCls)}>
          <StatusIcon className="h-3.5 w-3.5" /> {t.label}
        </div>
      </div>
      {/* glowing pedestal base */}
      <div
        className={clsx(
          "mt-2 h-3 w-4/5 rounded-[50%] bg-gradient-to-b to-transparent blur-md animate-pulse-glow",
          t.base,
        )}
      />
    </motion.div>
  );
}

export function ChannelThread() {
  return (
    <div className="relative hidden h-px items-center md:flex">
      <div className="flow-thread h-[2px] w-full rounded-full" />
    </div>
  );
}

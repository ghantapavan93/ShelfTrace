"use client";

import Link from "next/link";
import clsx from "clsx";
import { Clock, Tag, ScanLine, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, timeOf } from "@/lib/format";
import type { ActionView, ChannelView } from "@/lib/types";

const CH = { pos: { Icon: ScanLine, name: "POS" }, esl: { Icon: Tag, name: "ESL Shelf" }, ecommerce: { Icon: Globe, name: "Ecommerce" } } as const;

function ChannelChip({ c }: { c: ChannelView }) {
  const { Icon, name } = CH[c.channel];
  const ok = c.status === "verified";
  return (
    <div className={clsx("flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs", ok ? "border-emerald-500/30 text-verified" : "border-amber-500/40 text-warn")}>
      <Icon className="h-3.5 w-3.5" /> {name}
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
    </div>
  );
}

export default function MarkdownsPage() {
  const { data, error } = useLive(() => api.markdowns(DEMO_BATCH));

  if (error) return <div className="glass rounded-2xl p-6 text-slate-300">Could not load markdowns.</div>;
  if (!data) return <div className="text-slate-400">Loading markdowns…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Perishable Markdowns</h1>
        <p className="text-sm text-slate-400">
          Markdown reliability for {data.zone}. Shelf labels must reflect markdowns before the sell-through deadline.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.markdowns.map(({ action, markdown_deadline }: { action: ActionView; markdown_deadline: string }) => {
          const eslOk = action.channels.find((c) => c.channel === "esl")?.status === "verified";
          return (
            <div
              key={action.id}
              className={clsx(
                "glass rounded-2xl p-5",
                eslOk ? "border border-emerald-500/25" : "border border-amber-500/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{action.product_name}</h3>
                  <p className="text-xs text-slate-400">
                    Store {action.store_id} · markdown to {money(action.approved_price)} from {money(action.prior_price)}
                  </p>
                </div>
                <div className={clsx("flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs", eslOk ? "text-verified" : "text-warn")}>
                  <Clock className="h-3.5 w-3.5" /> {timeOf(markdown_deadline)}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {action.channels.map((c) => (
                  <ChannelChip key={c.channel} c={c} />
                ))}
              </div>

              {!eslOk && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  Shelf label has not acknowledged the markdown. It may not be visible to in-store shoppers before the
                  deadline. Retry the ESL update or assign an associate.
                </div>
              )}
            </div>
          );
        })}
        {data.markdowns.length === 0 && (
          <div className="glass rounded-2xl p-6 text-slate-400">No perishable markdowns in this batch.</div>
        )}
      </div>
    </div>
  );
}

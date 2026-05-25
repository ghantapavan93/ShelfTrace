"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Activity,
  Boxes,
  LayoutGrid,
  Bell,
  Tag,
  Network,
  RotateCcw,
  ChevronDown,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Globe,
  Brain,
} from "lucide-react";
import { Brand } from "./Brand";
import { api } from "@/lib/api";

const NAV = [
  { href: "/vision", label: "Vision Studio", sub: "Concept showcase", icon: Sparkles, match: /^\/vision/ },
  { href: "/scenarios", label: "Scenario Builder", sub: "Configure a test run", icon: SlidersHorizontal, match: /^\/scenarios/ },
  { href: "/scrapers", label: "Competitor Scraping", sub: "Data extraction pipeline", icon: Globe, match: /^\/scrapers/ },
  { href: "/pricing", label: "Pricing Engine", sub: "Elasticity · profit-max", icon: Brain, match: /^\/pricing/ },
  { href: "/certification", label: "Certification Lab", sub: "Before go-live", icon: ShieldCheck, match: /^\/certification/ },
  { href: "/operations", label: "Live Operations", sub: "Command Center", icon: LayoutGrid, match: /^\/operations$/ },
  {
    href: "/operations/batches/memorial-day-dallas-02",
    label: "Batches",
    sub: "Canary verification",
    icon: Boxes,
    match: /^\/operations\/batches/,
  },
  { href: "/operations/incidents", label: "Incidents", sub: "Manage & triage", icon: Bell, match: /^\/operations\/incidents/ },
  { href: "/operations/markdowns", label: "Markdown SLAs", sub: "Perishable deadlines", icon: Tag, match: /^\/operations\/markdowns/ },
  { href: "/engineering", label: "Engineering Trace", sub: "Data lineage", icon: Network, match: /^\/engineering/ },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<{ label: string; tone: string } | null>(null);

  // Global rollout health, derived from real batch state and refreshed lightly.
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .systemStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pathname]);

  async function reset() {
    setResetting(true);
    try {
      await api.reset();
      router.refresh();
      const s = await api.systemStatus().catch(() => null);
      if (s) setStatus(s);
    } finally {
      setResetting(false);
    }
  }

  const toneCls =
    status?.tone === "verified"
      ? "bg-verified"
      : status?.tone === "danger"
        ? "bg-danger"
        : status?.tone === "warn"
          ? "bg-warn"
          : "bg-slate-400";

  return (
    <div className="bg-aurora flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-ink-900/60 px-4 py-5 backdrop-blur-xl lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.match.test(pathname);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition",
                  active
                    ? "bg-brand/15 text-white shadow-[inset_0_0_0_1px_rgba(255,106,43,0.3)]"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className={clsx("h-4.5 w-4.5", active && "text-brand-400")} size={18} />
                <span className="leading-tight">
                  <span className="block text-sm font-medium">{n.label}</span>
                  <span className="block text-[11px] text-slate-500">{n.sub}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <button
            onClick={reset}
            disabled={resetting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCcw className={clsx("h-3.5 w-3.5", resetting && "animate-spin")} />
            {resetting ? "Resetting…" : "Reset to demo state"}
          </button>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className={clsx("h-2 w-2 rounded-full animate-pulse-glow", toneCls)} />
              <span className="text-slate-300">{status?.label ?? "Checking rollout status…"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violetglow to-brand text-xs font-bold text-white">
              AD
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-medium text-white">Avery Davis</span>
              <span className="block text-[11px] text-slate-500">Operations Lead</span>
            </span>
            <ChevronDown className="ml-auto h-4 w-4 text-slate-500" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-ink-950/70 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Activity className="h-4 w-4 text-brand-400" />
            ShelfTrace Control Plane
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-300 sm:flex">
            Test before go-live · guard after approval
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-verified animate-pulse-glow" />
            Live · updates on action
          </div>
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Boxes,
  LayoutGrid,
  Bell,
  Tag,
  Network,
  GitBranch,
  RotateCcw,
  ArrowUpRight,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Globe,
  Brain,
  Menu,
  X,
} from "lucide-react";
import { Brand } from "./Brand";
import { ModeBadge } from "./ModeBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { api } from "@/lib/api";
import { EASE } from "@/lib/motion";

const NAV = [
  { href: "/vision", label: "Vision Studio", sub: "Concept showcase", icon: Sparkles, match: /^\/vision/ },
  { href: "/scenarios", label: "Scenario Builder", sub: "Configure a test run", icon: SlidersHorizontal, match: /^\/scenarios/ },
  { href: "/scrapers", label: "Competitor Scraping", sub: "Data extraction pipeline", icon: Globe, match: /^\/scrapers/ },
  { href: "/product-graph", label: "Knowledge Graph", sub: "Cross-source unification", icon: Network, match: /^\/product-graph/ },
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
  { href: "/engineering", label: "Engineering Trace", sub: "Data lineage", icon: GitBranch, match: /^\/engineering/ },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { toast } = useToast();
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<{ label: string; tone: string } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Auto-close mobile nav when the route changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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

  async function performReset() {
    setResetting(true);
    try {
      await api.reset();
      router.refresh();
      const s = await api.systemStatus().catch(() => null);
      if (s) setStatus(s);
      toast.success("Demo state restored — Memorial Day batch reseeded.");
    } catch (e) {
      toast.error(`Reset failed: ${(e as Error).message}`);
    } finally {
      setResetting(false);
      setConfirmResetOpen(false);
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
            onClick={() => setConfirmResetOpen(true)}
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
          {/* Author signature chip — replaces the Avery Davis placeholder.
              Confidence-not-desperation tone aligned to the BetterBasket
              founders' builder voice (Vagelis + Leon from the YC launch). */}
          <a
            href="https://www.linkedin.com/in/pavankalyan-ghanta-b20115200/"
            target="_blank"
            rel="noopener noreferrer"
            title="ShelfTrace makes the approved price land at every shelf, every register, every listing. Ready to build that at BetterBasket."
            className="group relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white/[.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-400/40"
          >
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violetglow to-brand text-xs font-bold text-white">
              PG
              {/* Tiny availability pulse — matches the "Live" dot elsewhere */}
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-ink-900">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
              </span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium text-white">Pavan Kalyan Ghanta</span>
              <span className="block truncate text-[11px] text-slate-400 transition group-hover:text-orange-300">
                Reliability layer for grocery price execution
              </span>
            </span>
            <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-orange-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-ink-950/70 px-4 py-3 backdrop-blur-xl sm:px-5">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Activity className="h-4 w-4 text-brand-400" />
            <span className="hidden sm:inline">ShelfTrace Control Plane</span>
            <span className="sm:hidden">ShelfTrace</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-300 md:flex">
            Test before go-live · guard after approval
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <ModeBadge />
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-verified animate-pulse-glow" />
              <span className="hidden md:inline">Live · updates on action</span>
              <span className="md:hidden">Live</span>
            </span>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-5 sm:py-6 lg:px-8">{children}</main>
      </div>

      {/* Mobile navigation drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            />
            <motion.nav
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              initial={reduced ? false : { x: "-100%" }}
              animate={{ x: 0 }}
              exit={reduced ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: 0.32, ease: EASE.outQuart }}
              className="fixed bottom-0 left-0 top-0 z-50 flex w-72 flex-col overflow-hidden border-r border-white/10 bg-ink-900 shadow-[12px_0_40px_rgba(0,0,0,.5)] lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
                <Brand />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close"
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4">
                <div className="flex flex-col gap-1">
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
                </div>
              </div>

              <div className="space-y-3 border-t border-white/5 px-3 py-4">
                <button
                  onClick={() => {
                    setMobileNavOpen(false);
                    setConfirmResetOpen(true);
                  }}
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
                <a
                  href="https://www.linkedin.com/in/pavankalyan-ghanta-b20115200/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white/[.05]"
                >
                  <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violetglow to-brand text-xs font-bold text-white">
                    PG
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-ink-900">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                    </span>
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium text-white">Pavan Kalyan Ghanta</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      Reliability layer for grocery price execution
                    </span>
                  </span>
                  <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-slate-500" />
                </a>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Reset confirmation — protects the demo from accidental clicks */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Restore the demo state?"
        body={
          <>
            This wipes any custom scenarios you've created and reseeds the
            Memorial Day Dallas Zone 2 batch. Anything you uploaded via{" "}
            <span className="text-slate-300">/scenarios</span> will be gone.
            The seeded demo experience comes back fresh.
          </>
        }
        confirmLabel="Restore demo"
        variant="danger"
        busy={resetting}
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={performReset}
      />
    </div>
  );
}

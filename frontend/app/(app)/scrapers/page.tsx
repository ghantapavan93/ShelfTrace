"use client";

/**
 * /scrapers — competitor data extraction surface.
 *
 * Three panels:
 *   1. Source picker (left) — read from the registry
 *   2. Run trigger + recent runs (right top)
 *   3. Scraped products table (full-width below, with search + pagination)
 *
 * Frames the "this is a scrape-technique demo, production would point
 * at real grocer sites with proper authorization" note up front so
 * reviewers understand the scope without us hiding the disclaimer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Search,
  ShieldCheck,
  Database,
  Globe,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Code2,
  RefreshCw,
  Download,
  ImageOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { ListSkeleton } from "@/components/Skeleton";

type Source = {
  source_id: string;
  name: string;
  description: string;
  start_url: string;
  max_pages: number;
};

type RunSummary = {
  source_id: string;
  pages_fetched: number;
  pages_skipped_by_robots?: number;
  products_seen: number;
  products_inserted: number;
  products_updated: number;
  products_persisted: number;
  products_rejected?: number;
  price_changes_detected?: number;
  duration_ms: number;
  errors: string[];
  row_errors?: Array<{ page_url: string; raw_external_id: string; field: string; reason: string }>;
};

export default function ScrapersPage() {
  const [selected, setSelected] = useState<string>("books_demo");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce search → API
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const sources = useLive<{ sources: Source[] }>(() => api.scrapingSources());
  const runs = useLive(() => api.scrapingRuns(), [reloadKey]);
  const products = useLive(
    () =>
      api.scrapingProducts({
        source_id: selected,
        q: debouncedSearch || undefined,
        limit: 50,
      }),
    [selected, debouncedSearch, reloadKey],
  );

  const selectedSource = useMemo(
    () => sources.data?.sources.find((s) => s.source_id === selected),
    [sources.data, selected],
  );

  const triggerRun = useCallback(async () => {
    setRunning(true);
    setLastRun(null);
    try {
      const result = await api.scrapingRunTrigger(selected);
      setLastRun(result);
      setReloadKey((k) => k + 1); // refresh products + runs
    } catch (e) {
      setLastRun({
        source_id: selected,
        pages_fetched: 0,
        pages_skipped_by_robots: 0,
        products_seen: 0,
        products_inserted: 0,
        products_updated: 0,
        products_persisted: 0,
        products_rejected: 0,
        price_changes_detected: 0,
        duration_ms: 0,
        errors: [(e as Error).message],
        row_errors: [],
      });
    } finally {
      setRunning(false);
    }
  }, [selected]);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Competitor Scraping</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Production-shaped data extraction pipeline. Fetch → parse →
            validate → normalize → deduplicate → preserve observations.
            This policy-safe reference source demonstrates the extraction
            architecture. A real grocery source would require retailer-specific
            access, rendering, compliance review and grocery-specific normalization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-emerald-200">
            <ShieldCheck className="h-3 w-3" /> Idempotent upsert
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-violet-200">
            <Database className="h-3 w-3" /> Postgres-backed
          </span>
        </div>
      </div>

      {/* Scope note — honest framing about the demo target */}
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.04] px-4 py-3 text-sm text-amber-200">
        <span className="font-semibold">Scope note:</span> the wired
        spider targets{" "}
        <a
          href="https://books.toscrape.com/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-amber-400/60 underline-offset-2"
        >
          books.toscrape.com
        </a>{" "}
        — the standard scraper-practice site — because production grocer
        sites have anti-bot defenses and ToS restrictions that require a
        commercial scraping agreement. The DATA SHAPE is identical to a
        competitor product listing (title, price, category, availability,
        image), and the same pipeline consumes that shape regardless of source.
        Retailer-specific adapters remain future integration work and are not
        connected in this demo.
      </div>

      {/* ── Source + Run panel ───────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        {/* Left: sources */}
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Available sources
          </h2>
          {sources.data ? (
            <div className="space-y-2">
              {sources.data.sources.map((s) => {
                const active = s.source_id === selected;
                return (
                  <button
                    key={s.source_id}
                    onClick={() => setSelected(s.source_id)}
                    className={clsx(
                      "group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                      active
                        ? "border-brand/40 bg-brand/[.06]"
                        : "border-white/10 bg-white/[.02] hover:border-white/20 hover:bg-white/[.04]",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border",
                        active
                          ? "border-brand/40 bg-brand/15 text-brand-400"
                          : "border-white/10 bg-white/5 text-slate-400",
                      )}
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {s.name}
                        </span>
                        <span className="mono rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                          max {s.max_pages} pages
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        {s.description}
                      </p>
                      <p className="mono mt-1 truncate text-[10px] text-slate-600">
                        {s.start_url}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <ListSkeleton rows={2} />
          )}
        </section>

        {/* Right: trigger run + recent runs */}
        <section className="glass rounded-2xl p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Run a scrape
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedSource
                  ? `Will fetch up to ${selectedSource.max_pages} pages from ${selectedSource.name}.`
                  : "Pick a source on the left."}
              </p>
            </div>
            <button
              type="button"
              onClick={triggerRun}
              disabled={running || !selectedSource}
              className={clsx(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                running
                  ? "cursor-wait bg-white/10 text-slate-400"
                  : "bg-gradient-to-r from-brand to-brand-600 text-white shadow-glow-brand hover:brightness-110",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {running ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Run scrape
                </>
              )}
            </button>
          </div>

          {/* Live result of the run we just triggered */}
          <AnimatePresence>
            {lastRun && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={clsx(
                  "mt-3 rounded-xl border px-3 py-2.5 text-xs",
                  lastRun.errors.length > 0
                    ? "border-rose-500/30 bg-rose-500/[.06] text-rose-200"
                    : "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-200",
                )}
              >
                <div className="flex items-center gap-2">
                  {lastRun.errors.length > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span className="font-semibold">
                    {lastRun.errors.length > 0 ? "Finished with errors" : "Run complete"}
                  </span>
                  <span className="ml-auto mono text-[10px] opacity-75">
                    {lastRun.duration_ms} ms
                  </span>
                </div>
                <div className="mono mt-1 text-[11px] opacity-90">
                  <span className="font-semibold">{lastRun.pages_fetched}</span> pages ·{" "}
                  <span className="font-semibold">{lastRun.products_seen}</span> seen ·{" "}
                  <span className="font-semibold text-emerald-300">
                    {lastRun.products_inserted}
                  </span>{" "}
                  inserted ·{" "}
                  <span className="font-semibold text-sky-300">
                    {lastRun.products_updated}
                  </span>{" "}
                  updated
                  {lastRun.products_rejected ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-rose-300">
                        {lastRun.products_rejected}
                      </span>{" "}
                      rejected
                    </>
                  ) : null}
                  {lastRun.price_changes_detected ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-amber-300">
                        {lastRun.price_changes_detected}
                      </span>{" "}
                      price changes
                    </>
                  ) : null}
                  {lastRun.pages_skipped_by_robots ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-violet-300">
                        {lastRun.pages_skipped_by_robots}
                      </span>{" "}
                      blocked by robots.txt
                    </>
                  ) : null}
                </div>
                {lastRun.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[11px] opacity-90">
                    {lastRun.errors.slice(0, 3).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {lastRun.errors.length > 3 && (
                      <li>(+{lastRun.errors.length - 3} more)</li>
                    )}
                  </ul>
                )}
                {lastRun.row_errors && lastRun.row_errors.length > 0 && (
                  <details className="mt-2 text-[11px]">
                    <summary className="cursor-pointer text-amber-300 underline-offset-2 hover:underline">
                      {lastRun.row_errors.length} row{lastRun.row_errors.length === 1 ? "" : "s"} dropped by validation — show details
                    </summary>
                    <ul className="mt-1 list-disc pl-4 opacity-90">
                      {lastRun.row_errors.slice(0, 5).map((e, i) => (
                        <li key={i}>
                          <span className="mono">{e.raw_external_id || "(no id)"}</span> · {e.field}: {e.reason}
                        </li>
                      ))}
                      {lastRun.row_errors.length > 5 && (
                        <li>(+{lastRun.row_errors.length - 5} more)</li>
                      )}
                    </ul>
                  </details>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recent runs history */}
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
              Recent runs
            </div>
            {runs.data ? (
              runs.data.runs.length === 0 ? (
                <p className="text-xs text-slate-500">No runs yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {runs.data.runs.slice(0, 5).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[.02] px-2.5 py-1.5 text-[11px]"
                    >
                      <span
                        className={clsx(
                          "flex h-5 w-5 items-center justify-center rounded",
                          r.status === "success"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : r.status === "failed"
                              ? "bg-rose-500/15 text-rose-300"
                              : "bg-amber-500/15 text-amber-300",
                        )}
                      >
                        {r.status === "success" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : r.status === "failed" ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </span>
                      <span className="text-slate-300">{r.source_id}</span>
                      <span className="mono ml-auto text-slate-500">
                        +{r.products_inserted} new · {r.products_updated} updated · {r.duration_ms}ms
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <ListSkeleton rows={2} />
            )}
          </div>
        </section>
      </div>

      {/* ── Products table ──────────────────────────────────────────── */}
      <section className="glass rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Scraped products
              {selectedSource && (
                <span className="ml-2 font-normal text-slate-500">
                  · {selectedSource.name}
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Upserted by{" "}
              <code className="mono rounded bg-black/30 px-1 py-0.5 text-[10px]">
                stable_key = f"&#123;source_id&#125;:&#123;external_id&#125;"
              </code>
              . Same product across runs bumps{" "}
              <span className="text-slate-300">observation_count</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title…"
                className="w-64 rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-2 text-xs text-white outline-none focus:border-brand/50"
              />
            </div>
            <a
              href={`${api.base}/api/v1/scraping/products/export.csv${
                selected || debouncedSearch
                  ? `?${[
                      selected ? `source_id=${encodeURIComponent(selected)}` : "",
                      debouncedSearch ? `q=${encodeURIComponent(debouncedSearch)}` : "",
                    ]
                      .filter(Boolean)
                      .join("&")}`
                  : ""
              }`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              title="Export current view as CSV"
            >
              <Download className="h-3 w-3" /> Export CSV
            </a>
          </div>
        </div>

        {products.data ? (
          products.data.products.length === 0 ? (
            <EmptyState onRun={triggerRun} sourceName={selectedSource?.name ?? "this source"} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[.06]">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-black/60 backdrop-blur text-[10px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-white/5">
                      <th className="py-2 pl-3 pr-2 font-medium">Product</th>
                      <th className="py-2 pr-2 font-medium">Category</th>
                      <th className="py-2 pr-2 font-medium">Availability</th>
                      <th className="py-2 pr-2 text-right font-medium">Price</th>
                      <th className="py-2 pr-3 text-right font-medium">Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.data.products.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="py-2 pl-3 pr-2">
                          <div className="flex items-center gap-2">
                            <ProductImage src={p.image_url} alt={p.title} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-white">
                                {p.title}
                              </div>
                              <div className="mono text-[10px] text-slate-500">
                                {p.external_id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-slate-400">{p.category ?? "—"}</td>
                        <td className="py-2 pr-2">
                          <AvailabilityPill v={p.availability} />
                        </td>
                        <td className="mono py-2 pr-2 text-right font-semibold tabular-nums text-white">
                          {p.currency === "GBP" ? "£" : p.currency === "EUR" ? "€" : "$"}
                          {p.price.toFixed(2)}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-500">
                          <div className="mono">{p.observation_count}×</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <ListSkeleton rows={5} />
        )}
      </section>

      {/* Cross-page integration hint */}
      <div className="glass rounded-2xl border border-violet-500/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              Feeding scraped prices into the pricing engine
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              In production, the pricing engine would join{" "}
              <code className="mono rounded bg-black/30 px-1 py-0.5 text-[10px]">
                competitor_products
              </code>{" "}
              against your catalog SKU map (via title fuzzy match or a
              product-knowledge-graph join) to surface "competitors are
              undercutting you on these 12 SKUs" recommendations. The
              recommended price changes would then flow into the existing{" "}
              <Link href="/scenarios" className="text-violet-300 underline">
                Scenarios Builder
              </Link>{" "}
              → reconciliation → execution loop you've seen on{" "}
              <Link href="/operations" className="text-violet-300 underline">
                /operations
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/scenarios"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                Open Scenarios <ExternalLink className="h-3 w-3" />
              </Link>
              <a
                href="https://github.com/ghantapavan93/ShelfTrace/tree/main/backend/app/scrapers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                <Code2 className="h-3 w-3" /> View scraper module source
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onRun, sourceName }: { onRun: () => void; sourceName: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[.02] px-6 py-8 text-center">
      <Database className="mx-auto h-6 w-6 text-slate-500" />
      <p className="mt-2 text-sm text-slate-300">No scraped products yet</p>
      <p className="mt-1 text-xs text-slate-500">
        Run a scrape against {sourceName} to populate this table.
      </p>
      <button
        type="button"
        onClick={onRun}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-400 hover:bg-brand/15"
      >
        <Play className="h-3 w-3" /> Run scrape now
      </button>
    </div>
  );
}

/**
 * ProductImage — handles null + 404 (broken-image) cases with a neutral
 * placeholder so the table never shows browser's default missing-image icon.
 */
function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div
        className="flex h-8 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[.04] text-slate-600"
        aria-label="No image"
      >
        <ImageOff className="h-3 w-3" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className="h-8 w-6 rounded border border-white/10 object-cover"
      loading="lazy"
    />
  );
}

function AvailabilityPill({ v }: { v: string | null }) {
  if (!v) return <span className="text-slate-600">—</span>;
  const tone =
    v === "in_stock"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : v === "out_of_stock"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return (
    <span className={clsx("inline-flex rounded-full border px-1.5 py-0.5 text-[10px]", tone)}>
      {v.replace(/_/g, " ")}
    </span>
  );
}

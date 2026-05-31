"use client";

/**
 * /product-graph — Cross-source product knowledge graph.
 *
 * Three panels:
 *   1. Hero + seed/match controls
 *   2. Category hierarchy tree (left)
 *   3. Canonical entities list (right) with drill-down to linked SKUs
 *      and competitor observations
 *
 * The whole point: show the founder that every internal SKU, every
 * competitor product, every category is wired into ONE canonical
 * entity per real-world product. Pricing decisions can now ask "what
 * are all sources charging for this entity?" instead of guessing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Network,
  Boxes,
  Tag,
  Globe,
  ShieldCheck,
  Sparkles,
  Layers,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Link as LinkIcon,
  ArrowRight,
  Zap,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money } from "@/lib/format";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useWorkMode } from "@/components/ModeProvider";
import { EntityGraphVisualization } from "@/components/product-graph/EntityGraphVisualization";
import { SubstitutesPanel } from "@/components/product-graph/SubstitutesPanel";
import { TierLadder } from "@/components/product-graph/TierLadder";
import { CpiIntegrityBadge } from "@/components/CpiIntegrityBadge";

type EntitySummary = {
  id: string;
  canonical_title: string;
  brand: string | null;
  manufacturer: string | null;
  upc: string | null;
  category_id: string | null;
  unit_size: string | null;
  attributes: Record<string, unknown>;
  match_confidence: number;
  is_manual: boolean;
  linked_sku_count: number;
  competitor_observation_count: number;
  created_at: string;
};

type EntityDetail = {
  entity: {
    id: string;
    canonical_title: string;
    brand: string | null;
    manufacturer: string | null;
    upc: string | null;
    category_id: string | null;
    category_name?: string | null;
    unit_size: string | null;
    attributes: Record<string, unknown>;
    match_confidence: number;
    is_manual: boolean;
    created_at: string;
  };
  linked_skus: Array<{
    sku: string;
    zone_id: string | null;
    linked_at: string;
    current_price?: number | null;
  }>;
  competitor_observations: Array<{
    source: string;
    source_id?: string | null;
    competitor_title?: string | null;
    competitor_category?: string | null;
    price: number;
    currency: string;
    zone_id: string | null;
    store_id: string | null;
    observed_at: string;
    delta_pct: number | null;
    match_score?: number | null;
    match_signals?: {
      title_sim: number | null;
      brand_match: boolean | null;
      unit_size_match: boolean | null;
      category_match: boolean | null;
    };
  }>;
};

type CategoryNode = {
  id: string;
  name: string;
  description: string | null;
  children: unknown[];
};

function filterCategoryTree(nodes: CategoryNode[], allowedIds: Set<string>): CategoryNode[] {
  const filtered: CategoryNode[] = [];
  for (const node of nodes) {
    const children = filterCategoryTree(
      ((node.children as CategoryNode[]) || []),
      allowedIds,
    );
    if (allowedIds.has(node.id) || children.length > 0) {
      filtered.push({ ...node, children });
    }
  }
  return filtered;
}

export default function ProductGraphPage() {
  const [busy, setBusy] = useState<"seed" | "match" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const { toast } = useToast();
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";

  // Send ?scope=live to the backend in Live mode so the entity list comes
  // back already filtered at the SQL layer — the legacy attribute-based
  // frontend filter below stays as defense-in-depth.
  const entities = useLive(
    () => api.graphEntities(100, isLiveWorkMode ? "live" : undefined),
    [reloadKey, isLiveWorkMode],
  );
  const categories = useLive(() => api.graphCategories(), [reloadKey]);
  // CPI Integrity — scope-aware so Live mode never counts demo-seeded inputs.
  const cpiIntegrity = useLive(
    () => api.cpiIntegrity(isLiveWorkMode ? "live" : undefined),
    [reloadKey, isLiveWorkMode],
  );

  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch detail when entity selected
  useEffect(() => {
    if (!selectedEntityId) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    api
      // Scope the detail's linked SKUs + competitor observations to match
      // the (already-scoped) entity list, so a Live-mode card never shows
      // demo-seeded observations on a shared entity.
      .graphEntity(selectedEntityId, isLiveWorkMode ? "live" : undefined)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) toast.error(`Failed to load entity: ${(e as Error).message}`);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedEntityId, reloadKey, toast, isLiveWorkMode]);

  const handleSeed = useCallback(async () => {
    setBusy("seed");
    try {
      const result = await api.graphSeedDemo();
      if (result.seeded) {
        toast.success(
          `Seeded ${result.entities} entities · ${result.sku_links} SKU links · ${result.observations} competitor observations.`,
        );
      } else {
        toast.info(result.note);
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Seed failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const handleBulkMatch = useCallback(async () => {
    setBusy("match");
    try {
      const result = await api.graphBulkMatch(0.7);
      toast.success(
        `Auto-matched ${result.matched_count} competitor products · ${result.skipped_count} skipped (below 70% confidence).`,
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Bulk match failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const visibleEntities = useMemo(() => {
    const list = entities.data?.entities ?? [];
    if (!isLiveWorkMode) return list;
    // In Live mode, hide entities that came from the seed-demo endpoint
    // (the 3 Memorial Day canonical products: eggs, strawberries, OJ).
    // Those are flagged is_manual=true on the seeded rows AND carry no
    // bootstrap attribute. Manually-created entities via POST /entities
    // are NOT hidden — only the demo seed is.
    return list.filter((e) => {
      const seededDemo =
        e.is_manual === true &&
        e.attributes?.bootstrapped_from_scenario !== true;
      return !seededDemo;
    });
  }, [entities.data, isLiveWorkMode]);

  useEffect(() => {
    if (selectedEntityId && !visibleEntities.some((e) => e.id === selectedEntityId)) {
      setSelectedEntityId(null);
    }
  }, [selectedEntityId, visibleEntities]);

  const totalEntities = visibleEntities.length;
  const totalSkus = useMemo(
    () => visibleEntities.reduce((s, e) => s + e.linked_sku_count, 0),
    [visibleEntities],
  );
  const totalObservations = useMemo(
    () =>
      visibleEntities.reduce((s, e) => s + e.competitor_observation_count, 0),
    [visibleEntities],
  );
  const visibleCategoryIds = useMemo(
    () =>
      new Set(
        visibleEntities
          .map((entity) => entity.category_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [visibleEntities],
  );
  const visibleCategories = useMemo(() => {
    const all = (categories.data?.categories as CategoryNode[]) ?? [];
    return isLiveWorkMode ? filterCategoryTree(all, visibleCategoryIds) : all;
  }, [categories.data, isLiveWorkMode, visibleCategoryIds]);
  const totalCategories = useMemo(() => {
    const count = (nodes: CategoryNode[]): number =>
      nodes.reduce((s, n) => s + 1 + count((n.children as CategoryNode[]) || []), 0);
    return count(visibleCategories);
  }, [visibleCategories]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="iris-border glow-iris relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-850 via-ink-900 to-black px-7 py-8"
      >
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(60%_80%_at_80%_30%,rgba(168,85,247,0.18),transparent_70%)]" />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">
            <Network className="h-3.5 w-3.5" /> Product Knowledge Graph
          </div>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-white">
            Cross-source product <span className="iris-text">unification</span>
            <span className="block text-2xl font-medium text-slate-400">
              one canonical entity per real-world product, linked to every SKU & competitor source.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-400">
            Without this layer, every channel sees a different SKU number. With it, the
            pricing engine can ask &ldquo;what are competitors charging for this entity?&rdquo;,
            the cannibalization detector can find substitutes, and scenarios can resolve
            their SKUs into a richer pricing context.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {!isLiveWorkMode ? (
              <button
                onClick={handleSeed}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40 disabled:opacity-50"
              >
                {busy === "seed" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Seed Memorial Day graph
              </button>
            ) : (
              <Link
                href="/scenarios"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40"
              >
                <Database className="h-4 w-4" />
                Upload scenario data
              </Link>
            )}
            {!isLiveWorkMode && (
              <button
                onClick={handleBulkMatch}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {busy === "match" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Auto-match competitors
              </button>
            )}
          </div>
          {isLiveWorkMode && (
            <p className="relative mt-3 max-w-2xl text-xs text-violet-200/80">
              Live mode shows only entities bootstrapped from uploaded or manually-created
              scenarios. Memorial Day demo entities stay hidden here unless you switch back to Demo.
            </p>
          )}
        </div>
      </motion.section>

      {/* Competitor index integrity — is the CPI built on the price that
          actually rang? Null-guarded; the badge renders its own calm empty
          state when no inputs are linked yet. */}
      {cpiIntegrity.data && <CpiIntegrityBadge data={cpiIntegrity.data} />}

      {/* Metric tiles */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          icon={Boxes}
          label="Canonical entities"
          value={totalEntities}
          tone="violet"
          sub="Unified products"
        />
        <Tile
          icon={LinkIcon}
          label="Linked SKUs"
          value={totalSkus}
          tone="brand"
          sub="Internal product IDs"
        />
        <Tile
          icon={Globe}
          label="Competitor observations"
          value={totalObservations}
          tone="emerald"
          sub="From scraped sources"
        />
        <Tile
          icon={Layers}
          label="Categories"
          value={totalCategories}
          tone="sky"
          sub="Hierarchy nodes"
        />
      </section>

      {/* Main two-column layout */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Categories panel */}
        <div className="holo-card rounded-2xl p-5 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <Layers className="h-4 w-4 text-sky-300" />
            Category hierarchy
          </div>
          {categories.data ? (
            visibleCategories.length === 0 ? (
              <EmptyHint
                message={
                  isLiveWorkMode
                    ? "No uploaded categories yet - import or build a scenario to populate."
                    : "No categories yet - seed the demo graph to populate."
                }
              />
            ) : (
              <ul className="space-y-1.5">
                {visibleCategories.map((cat) => (
                  <CategoryRow key={cat.id} node={cat} depth={0} />
                ))}
              </ul>
            )
          ) : (
            <ListSkeleton rows={3} />
          )}
        </div>

        {/* Entities panel */}
        <div className="lg:col-span-2">
          <div className="holo-card rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                <Boxes className="h-4 w-4 text-violet-300" />
                Canonical entities ({totalEntities})
              </div>
              {selectedEntityId && (
                <button
                  onClick={() => setSelectedEntityId(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Clear selection
                </button>
              )}
            </div>
            {entities.data ? (
              visibleEntities.length === 0 ? (
                <EmptyHint
                  message={
                    isLiveWorkMode
                      ? "No uploaded-product graph yet - import a CSV or build a scenario, then run auto-enrichment."
                      : "No entities yet - click 'Seed Memorial Day graph' above to populate."
                  }
                />
              ) : (
                <div className="space-y-2">
                  {visibleEntities.map((e) => (
                    <EntityRow
                      key={e.id}
                      entity={e}
                      selected={selectedEntityId === e.id}
                      onSelect={() =>
                        setSelectedEntityId(selectedEntityId === e.id ? null : e.id)
                      }
                    />
                  ))}
                </div>
              )
            ) : (
              <ListSkeleton rows={3} />
            )}
          </div>

          {/* Entity detail */}
          <AnimatePresence>
            {selectedEntityId && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mt-4"
              >
                {detailLoading ? (
                  <div className="glass rounded-2xl p-5">
                    <ListSkeleton rows={2} />
                  </div>
                ) : detail ? (
                  <EntityDetailCard detail={detail} />
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Help footer */}
      <section className="holo-card rounded-2xl p-5 text-xs text-slate-400">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
          <div>
            <div className="font-medium text-slate-300">How this connects to scenarios</div>
            <p className="mt-1">
              When you run a scenario, each action&apos;s SKU is resolved to its canonical
              entity. The pricing engine can then pull competitor reference prices and
              detect substitutes using the cross-elasticity model. Open{" "}
              <Link href="/scenarios" className="text-brand-400 hover:underline">
                /scenarios
              </Link>{" "}
              {isLiveWorkMode
                ? "after uploading data to see competitor price hints alongside each action row."
                : "after seeding to see competitor price hints alongside each action row."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  sub: string;
  tone: "violet" | "brand" | "emerald" | "sky";
}) {
  const toneClass = {
    violet: "border-violet-500/25 bg-violet-500/5 text-violet-300",
    brand: "border-brand/25 bg-brand/5 text-brand-400",
    emerald: "border-emerald-500/25 bg-emerald-500/5 text-emerald-300",
    sky: "border-sky-500/25 bg-sky-500/5 text-sky-300",
  }[tone];
  return (
    <div className={clsx("glass rounded-2xl border p-4", toneClass)}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function CategoryRow({ node, depth }: { node: CategoryNode; depth: number }) {
  const hasChildren = (node.children as CategoryNode[]).length > 0;
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren && <ChevronRight className="h-3 w-3 text-slate-500" />}
        {!hasChildren && <div className="h-3 w-3" />}
        <Tag className="h-3.5 w-3.5 text-sky-400" />
        {node.name}
      </div>
      {hasChildren && (
        <ul className="space-y-0.5">
          {(node.children as CategoryNode[]).map((c) => (
            <CategoryRow key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function EntityRow({
  entity,
  selected,
  onSelect,
}: {
  entity: EntitySummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={clsx(
        "w-full rounded-xl border px-3 py-2.5 text-left transition",
        selected
          ? "border-violet-500/40 bg-violet-500/5"
          : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 truncate text-sm font-medium text-white">
            <span className="truncate">{entity.canonical_title}</span>
            {entity.is_manual && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
                Manual
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            {entity.brand && <span>brand: {entity.brand}</span>}
            {entity.unit_size && <span>· {entity.unit_size}</span>}
            {entity.upc && <span>· UPC: {entity.upc}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 text-[11px] text-slate-500">
          <span title="Linked internal SKUs">
            <LinkIcon className="mr-0.5 inline h-3 w-3" />
            {entity.linked_sku_count}
          </span>
          <span title="Competitor observations">
            <Globe className="mr-0.5 inline h-3 w-3" />
            {entity.competitor_observation_count}
          </span>
          <ChevronRight
            className={clsx(
              "h-3 w-3 transition",
              selected && "rotate-90 text-violet-300",
            )}
          />
        </div>
      </div>
    </button>
  );
}

function EntityDetailCard({ detail }: { detail: EntityDetail }) {
  const { entity, linked_skus, competitor_observations } = detail;
  return (
    <div className="holo-card rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
        <Network className="h-4 w-4" /> Entity detail
      </div>

      {/* Cross-source graph visualization — shows how this canonical entity
          unifies internal SKUs (left) with competitor sources (right). */}
      <div className="mb-5">
        <EntityGraphVisualization
          entity={{
            canonical_title: entity.canonical_title,
            brand: entity.brand,
            unit_size: entity.unit_size,
            is_manual: entity.is_manual,
            category_name: entity.category_name ?? null,
          }}
          linkedSkus={linked_skus}
          competitorObservations={competitor_observations}
        />
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta k="Canonical title" v={entity.canonical_title} wide />
        <Meta k="Brand" v={entity.brand ?? "—"} />
        <Meta k="Unit size" v={entity.unit_size ?? "—"} />
        <Meta k="UPC" v={entity.upc ?? "—"} />
      </div>

      {/* Linked SKUs */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          <LinkIcon className="h-3.5 w-3.5 text-brand-400" />
          Linked internal SKUs ({linked_skus.length})
        </div>
        {linked_skus.length === 0 ? (
          <EmptyHint message="No SKUs linked to this entity yet." />
        ) : (
          <ul className="space-y-1">
            {linked_skus.map((s) => (
              <li
                key={`${s.sku}-${s.zone_id}`}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm"
              >
                <span className="mono text-brand-400">{s.sku}</span>
                <span className="text-[11px] text-slate-500">
                  {s.zone_id ?? "all zones"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Competitor observations */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          <Globe className="h-3.5 w-3.5 text-emerald-300" />
          Competitor observations ({competitor_observations.length})
        </div>
        {competitor_observations.length === 0 ? (
          <EmptyHint message="No competitor prices linked to this entity yet." />
        ) : (
          <ul className="space-y-1">
            {competitor_observations.map((o, i) => {
              const up = (o.delta_pct ?? 0) > 0;
              const down = (o.delta_pct ?? 0) < 0;
              return (
                <li
                  key={i}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm"
                >
                  <span className="col-span-4 truncate text-slate-300">
                    {o.source}
                  </span>
                  <span className="col-span-3 mono tabular-nums text-white">
                    {money(o.price)}
                  </span>
                  <span
                    className={clsx(
                      "col-span-3 flex items-center gap-1 text-xs",
                      up && "text-rose-300",
                      down && "text-emerald-300",
                      !up && !down && "text-slate-500",
                    )}
                  >
                    {up && <TrendingUp className="h-3 w-3" />}
                    {down && <TrendingDown className="h-3 w-3" />}
                    {o.delta_pct != null ? `${o.delta_pct.toFixed(1)}%` : "—"}
                  </span>
                  <span className="col-span-2 text-right text-[11px] text-slate-500">
                    {o.zone_id ?? "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Good · Better · Best tier ladder for this canonical product */}
      <div className="mt-5">
        <TierLadder
          entityTitle={entity.canonical_title}
          linkedSkus={linked_skus}
          competitorObservations={competitor_observations}
        />
      </div>

      {/* Substitutes & complements — cross-elasticity neighbours */}
      <div className="mt-5">
        <SubstitutesPanel entityId={entity.id} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
        <Link
          href="/scenarios"
          className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-400 hover:bg-brand/15"
        >
          Use in scenario <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
        >
          View pricing engine <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function Meta({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className="mono mt-0.5 truncate text-sm text-slate-200">{v}</div>
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.01] p-4 text-center text-xs text-slate-500">
      {message}
    </div>
  );
}

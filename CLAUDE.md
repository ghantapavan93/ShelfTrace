# ShelfTrace — Design + Engineering Guide for Claude sessions

This file is read automatically at the start of every Claude Code session
working in this repository. It encodes the project's design system, the
motion/animation language, and the discipline rules that have shaped the
codebase. Future sessions should keep working in this voice.

---

## Project north star

> **A reliability control plane for approved retail price execution.**
> Transactional outbox, deterministic reconciliation across shelf, POS and
> ecommerce, canary containment, audit-verified recovery. Independent
> prototype with 55 PostgreSQL-backed tests.

Two reviewer-facing entry points (`/vision/keynote`, `/vision/showcase`)
bridge into the working surfaces (`/operations`, `/engineering`,
`/scenarios`, `/certification`).

---

## Discipline rules (non-negotiable)

These exist because earlier sessions over-claimed and had to walk it back.

- **No fabricated numbers.** Only claim what the repo actually proves
  (current: 55 PostgreSQL-backed tests, configurable scenario engine,
  certification lab, live control plane, deterministic reconciliation,
  audit-verified recovery, transactional outbox, FOR UPDATE SKIP LOCKED,
  row-locked recovery).
- **No unsupported tech terms in marketing copy.** Banned in the UI unless
  actually implemented: Pact, OpenTelemetry SLO budgets, "twin replay,"
  "connector twin." (Note: OTel itself IS now wired — but as opt-in
  observability, not a marketing claim.)
- **No real retailer logos.** Fictional store contexts only
  (Dallas Market, Austin Zone 1, Store 214/302, etc.).
- **No autoplay sound. No recognizable people in imagery.** The Keynote
  prefers hand-illustrated SVG products over stock photography for exactly
  this reason.
- **`prefers-reduced-motion` honored** in every motion block. Test by
  toggling system preference.
- **Backend tests must stay green.** 55/55 on real Postgres is the floor.
  Any reliability-touching change requires a matching test.

---

## Design language

Inspired by Emil Kowalski (sonner / vaul / ngrok dashboards), the
taste-skill / soft-skill skills (https://www.tasteskill.dev/), Linear,
Vercel, and Raycast. The aim is **calm interfaces with cinematic moments**
— not dense dashboards trying to impress.

### Anti-patterns (banned without strong reason)
- Generic 1px solid gray borders → use `border-white/8` to `border-white/15`
  with intentional contrast
- Stock thick-stroked icons → `lucide-react` at `h-3.5 w-3.5` to `h-5 w-5`
  with consistent stroke
- Symmetrical 12-col Bootstrap grids → asymmetrical 1.05fr/1fr or 1.55fr/1fr
- Sticky top navbars on Vision pages (already exists in AppShell; Vision
  uses its own minimal GlobalHeader)
- `ease-in-out` / `linear` Framer transitions → use the named easings in
  `frontend/lib/motion.ts`
- Layout-affecting animations (`width`, `height`, `top`, `left`) → animate
  `transform` and `opacity` only

### Typography
- Hero H1: `clamp(48px, 8vw, 128px)`, `tracking-[-0.03em]`, `leading-[0.94]`,
  `font-semibold`
- Section H2: `clamp(32px, 5vw, 72px)`, `tracking-[-0.02em]`
- Body: `text-base leading-relaxed text-white/55` (or `/65` for emphasis)
- Eyebrow: `text-[10px] uppercase tracking-[.22em] text-orange-300`
- Monospace: `font-mono tabular-nums` for any number that ticks

### Color
- Background base: `#040608` (slightly cooler than pure black)
- Primary accent: orange-300/400/500 (`#fb923c` family)
- Verified: emerald-300/400
- Drift / mismatch: rose-300/400 (or `#f43f5e`)
- Hold / containment: violet/amber depending on context
- Text on dark: white / `white/75` / `white/55` / `white/35` ladder

### Spacing rhythm
- Section vertical padding: `py-24` to `py-36` (never less than `py-20`)
- Macro headlines need a `mt-5` / `mt-7` gap from their eyebrow
- Card padding: `p-5` to `p-8`
- Grid gaps: `gap-3` for tight rows, `gap-6` for cards, `gap-12` for layout

### Motion language
See `frontend/lib/motion.ts` for the canonical tokens. Summary:

| Use case | Easing | Duration |
|---|---|---|
| Hero entrance | `EASE.outQuart` | 1000–1100ms |
| Element fade-up on scroll | `EASE.outQuart` | 600–700ms |
| Hover / cursor follow | `SPRING.gentle` | n/a (spring) |
| Drag (scrubber, tablet tilt) | `SPRING.bouncy` | n/a (spring) |
| Exit / dismiss | `EASE.inQuart` | 200–300ms |
| Tooltip enter / exit | enter 120ms / exit 80ms | shorter on exit |

Spring tokens are concrete `{stiffness, damping}` constants, not
hand-tuned per call site.

### Component patterns
- **Pill chips** (eyebrows): rounded-full, `px-3 py-1`, `text-[9px]`
  tracking `.22em`, tonal border + bg
- **Cards** (always): rounded-2xl or rounded-3xl, `border border-white/10`,
  `bg-[#0a0e18]/85` or `bg-white/[.025]`, hover lifts via translateY (-2px)
- **CTAs**: pill-shaped, primary on white BG with black text, secondary
  with `border border-white/25 bg-white/[.04] backdrop-blur`
- **Press feedback**: `active:scale-[0.98]` on any clickable surface
- **Magnetic hover**: inner icon translates `0.5–1px` on group-hover

---

## Engineering rules

- Pure frontend changes (animations, copy, layout) never touch the backend
  diff. `git diff backend` must remain empty for marketing-only commits.
- Frontend lives in `frontend/` (Next.js 14 app router, Tailwind, Framer
  Motion, lucide-react). Backend lives in `backend/` (FastAPI + PostgreSQL
  + Redis + 47-test suite).
- Vision layout: `frontend/app/vision/layout.tsx` wraps with the minimal
  Shell (`GlobalHeader` + `FilmGrain` + `VisionFooter`). The reviewer
  nav is deliberately 5 items only:
  `Keynote · Showcase · Working Platform · Engineering Proof · Vision Concepts`.
- Backend env-driven knobs (`API_KEYS_JSON`, `OTEL_ENABLED`,
  `RATE_LIMIT_ENABLED`, `USE_ALEMBIC`, `DEAD_LETTER_WEBHOOK_URL`,
  `OUTBOX_RETRY_*`) all default to safe demo behaviour. See `backend/app/config.py`.
- New backend behaviour requires a Postgres-backed pytest. Concurrency
  changes go in `tests/test_concurrency_pg.py`.
- After significant changes always: `pytest -q` (backend) + `next build`
  (frontend) + `curl /health`. Never commit a regression.

---

## Reference: design skills informing this guide

These external SKILL.md files codify the philosophy. They are not
installed (no `npm` dependency); their principles have been captured
above in our own words.

- **emilkowalski/skill** — https://github.com/emilkowalski/skill
  Emil Kowalski's design engineering philosophy. Creator of `sonner`,
  `vaul`, ngrok dashboards. The single most respected design engineer
  working today. His rules around easing, gesture momentum, animation
  origin and "details compound" inform every motion decision in this
  codebase.

- **Leonxlnx/taste-skill** — https://www.tasteskill.dev/
  Anti-AI-slop framework. The `soft-skill` variant
  (https://github.com/Leonxlnx/taste-skill/tree/main/skills/soft-skill)
  is the closest match to the ShelfTrace aesthetic — calm interfaces,
  softer contrast, premium agency-level execution. Key principles
  borrowed: Double-Bezel nested architecture, Spatial Rhythm + Tension,
  Performance Guardrails (transform/opacity only), Section padding
  minimum py-24, custom cubic-bezier on all transitions.

If you want to invoke these as Claude skills directly:
```
npx skills add Leonxlnx/taste-skill
npx skills add emilkowalski/skill
```

---

## Working surfaces (deep links, all return 200)

- Reviewer entry: `/vision/keynote`, `/vision/showcase`
- Working platform: `/operations`, `/operations/batches/{id}`,
  `/operations/incidents`, `/operations/markdowns`
- Engineering proof: `/engineering`
- Builders: `/scenarios`, `/certification`
- Concepts: `/vision/horizon`
- Experimental (not in nav, direct URL only): `/vision/aisle`,
  `/vision/mission-control`, `/vision/orbit`, `/vision`,
  `/vision/reliability`

# ShelfTrace Control Plane

**Test every connector before go-live. Guard every price rollout after approval.**

### 🎬 Live demo

| | |
|---|---|
| **Cinematic pitch** | [shelf-trace.vercel.app/vision/keynote](https://shelf-trace.vercel.app/vision/keynote) |
| **Working platform** *(live data)* | [shelf-trace.vercel.app/operations](https://shelf-trace.vercel.app/operations) |
| **Engineering trace** *(pipeline + tests)* | [shelf-trace.vercel.app/engineering](https://shelf-trace.vercel.app/engineering) |
| **Build your own scenario** | [shelf-trace.vercel.app/scenarios](https://shelf-trace.vercel.app/scenarios) |
| **Pricing engine** *(elasticity demo, synthetic history)* | [shelf-trace.vercel.app/pricing](https://shelf-trace.vercel.app/pricing) |
| **Scrape technique demo** *(synthetic storefront)* | [shelf-trace.vercel.app/scrapers](https://shelf-trace.vercel.app/scrapers) |
| **Backend health** | [shelftrace-api.onrender.com/health](https://shelftrace-api.onrender.com/health) |

> ⏱️ **First click may take ~30s** while the free-tier backend wakes from idle. Subsequent navigation is instant. The full backend (FastAPI + PostgreSQL) runs on Render free tier; the frontend (Next.js) is on Vercel. Deploy config in [`render.yaml`](./render.yaml) + [`DEPLOY.md`](./DEPLOY.md).

---

One reliability platform with two modes: a **Certification Lab** that validates POS, shelf-label and ecommerce connectors before automated pricing is enabled, and a **Live Control Plane** that canaries approved price rollouts, verifies every customer-facing channel, and recovers incidents after activation.

> **Disclaimer.** Independent prototype inspired by public grocery pricing workflows. Uses sample data and simulated POS, ESL and ecommerce integrations. Not affiliated with, and makes no claim about, any company's internal systems.

---

## What this is

An AI pricing system can approve a perfect price. The hard part is the **last mile**: getting that price to show up correctly at the register, on the electronic shelf label, and online — across dozens of stores — without a shopper ever seeing $4.19 on the shelf and being charged $4.49 at checkout.

ShelfTrace Control Plane is the **release-safety layer that runs after approval**:

1. **Accepts** an already-approved price batch from an upstream pricing system.
2. **Canaries** the batch to a small set of stores first instead of the whole zone.
3. **Verifies** that POS, ESL, and ecommerce all agree with the approved price.
4. **Blocks** zone expansion, **retries**, **rolls back**, or **creates a store task** when a channel disagrees — and explains exactly what happened and what to do next.

## Why it matters

A shelf label can update while the register doesn't. A perishable markdown can be approved but never become visible before the item expires. A zone-wide batch can partially fail. ShelfTrace turns those silent execution failures into **blocked rollouts with a clear recovery path**, before they become shopper impact.

---

## The demo: Memorial Day Batch — Dallas Zone 2

One approved batch, 3 products, 4 stores (2 canary: 214 & 302; 2 expansion: 317 & 401):

| Product | Approved | What happens in canary | Result |
|---|---|---|---|
| Cage-Free Large Brown Eggs, 12ct | $4.19 | Shelf + online show $4.19, **POS still charges $4.49** | **Critical mismatch → zone blocked** |
| Fresh Strawberries, 1 lb | $2.99 | POS + online confirmed, **ESL shelf label times out** | **Deadline risk → retry** |
| Premium NFC Orange Juice, 52oz | $9.49 | All channels verified | **Eligible for expansion** |

### State sequence (proven end-to-end)

Expansion is gated on **every** canary action verifying — a single resolved action never unblocks the zone on its own:

| Step | Egg @214 | Strawberries (214/302) | Orange Juice | Batch status | Expansion |
|---|---|---|---|---|---|
| **A. Reset** | critical mismatch | deadline risk (timeout) | verified | `blocked` | blocked |
| **B. Retry egg POS** | resolved / eligible | still deadline risk | eligible | `partially_blocked` | **still blocked** |
| **C. Retry strawberry ESL** | eligible | resolved / eligible | eligible | `ready_for_expansion` | allowed |
| **D. Expand** | — | — | — | `completed` | done (expansion deliveries created only now, then verified) |

Every transition is written to the audit trail. The exact API responses for this sequence are reproducible with `python -m tests.prove_sequence` against a running backend.

---

## Architecture

```
 Approved Price Batch (upstream pricing system)
            │  POST /api/v1/price-batches  (idempotent)
            ▼
 FastAPI ── Pydantic validation + idempotency check
            │
            ▼   one transaction
 PostgreSQL ── batch + actions + canary/expansion rollout groups + OUTBOX events
            │
            ▼
 Outbox drain (inline on POST; optional Redis worker) ── processes pending events
            │
   ┌────────┼─────────────┐
   ▼        ▼             ▼
 POS      ESL        Ecommerce      (mock adapters: publish / verify / retry / rollback)
   └────────┼─────────────┘
            ▼
 Reconciliation engine ── normalize receipts → decide per action
            │                verified · timeout(retry) · mismatch(block)
            ▼
   ┌─────────────────────┬────────────────────────┐
   ▼                     ▼                        ▼
 Expand eligible     Block zone /            Create critical /
 actions             hold expansion          deadline-risk incident
            │
            ▼
 Recovery API (retry / rollback / store-task / resolve, row-locked)
            │
            ▼
 Audit trail + operator UI
```

### Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind, Framer Motion |
| Backend | FastAPI, SQLAlchemy 2, Pydantic v2 |
| Data | PostgreSQL (transactional state + outbox). Redis is optional — used by the standalone outbox worker and rate limiting; the API drains the outbox inline on POST, so the demo runs without it (`REDIS_ENABLED=false`). |
| Infra | Docker Compose; Azure-ready |

### Backend design highlights

- **Idempotency** — the same `idempotency_key` always maps to one workflow; a duplicate POST never creates a second batch or duplicate publish work.
- **Transactional outbox** — batch, actions, rollout groups, and outbox events are committed in a single transaction. No publish work is queued unless the whole batch persists.
- **Reconciliation rules** — pure decision logic: any mismatch → blocked (critical), any timeout → retry, all verified → eligible. Expansion never includes unresolved actions.
- **Plausibility gate** — before execution, an approved price that looks like a *data error* (below cost, ≥80% drop / ≥5× jump like a decimal slip, or one store wildly off the batch median) opens an `IMPLAUSIBLE_PRICE` incident and holds the batch. This catches the case channel reconciliation can't: every surface agrees on the *wrong* number. Deterministic, explainable rules over existing rows — no model. Retry/resolve are refused on these (re-pushing the same price can't fix it); rollback or an upstream price correction is the exit. See `app/services/plausibility.py`.
- **Operator acknowledgement** — every recovery action carries a recorded owner (`acknowledged_at` / `acknowledged_by`); if an operator skips the explicit Acknowledge step and acts directly, ownership is auto-stamped, so no incident is ever recovered un-owned. It's a recorded ownership stamp, not a mandatory approval gate.
- **Row-locked recovery** — incident recovery uses `SELECT … FOR UPDATE`; only one valid transition per incident state, so double-resolution is rejected, not raced.
- **Grounded explanations** — incident narratives are generated only from structured records (observed prices, channels, deadlines), never invented.

---

## Run it

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend (landing + app) | http://localhost:3000 |
| Operations Command Center | http://localhost:3000/operations |
| Backend API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |

The backend auto-seeds the Memorial Day / Dallas Zone 2 demo on first boot. Re-seed any time:

```bash
curl -X POST http://localhost:8000/api/v1/demo/reset
```

…or use the **Reset to demo state** button in the app sidebar.

### Frontend routes

- `/` — marketing landing with the live 5-stage execution pipeline
- `/operations` — command center (canary status, critical incident, rollout progress)
- `/operations/batches/[id]` — batch detail + canary verification matrix + Expand control
- `/operations/incidents/[id]` — incident detail (channel pedestals, explanation, recovery actions, audit)
- `/operations/markdowns` — perishable markdown reliability
- `/engineering` — execution trace: outbox events, simulated adapter receipt, reconciliation result, test proof

---

## Tests

```bash
cd backend
pip install -e ".[dev]"

# SQLite (fast; the Postgres-only concurrency tests auto-skip):
pytest

# Against the docker Postgres — full suite (355 tests, including row-lock concurrency):
DATABASE_URL=postgresql+psycopg2://shelftrace:shelftrace@localhost:5432/shelftrace_db pytest
```

| Test | Proves |
|---|---|
| `test_idempotent_batch` | Duplicate batch → one workflow |
| `test_batch_and_outbox_committed_together` | Outbox is created atomically with the batch |
| `test_canary_blocks_zone_expansion` | A checkout mismatch in canary blocks the zone |
| `test_expansion_excludes_unresolved_actions` | Blocked actions never become eligible |
| `test_checkout_mismatch_creates_critical_incident` | Mismatch → critical incident, grounded in the observed price |
| `test_esl_timeout_creates_deadline_risk` | Perishable ESL timeout → urgent deadline-risk incident |
| `test_retry_resolves_action_but_batch_stays_held` | Resolving one action does **not** unblock the zone while others are unresolved |
| `test_full_resolution_enables_expansion` | Batch becomes READY_FOR_EXPANSION only when every canary action verifies |
| `test_double_resolution_is_safe` | A second resolution attempt is rejected, not raced |
| `test_expansion_blocked_until_ready` | Expansion is refused unless the batch is ready |
| `test_expansion_creates_deliveries_only_when_ready_and_completes` | Expansion deliveries created only on expand; batch COMPLETES after verification |
| `test_all_transitions_are_audited` | Every state change writes an audit event |
| `test_explanation_is_grounded_in_records` | Explanations reference only structured facts |
| `test_concurrent_resolution_is_serialized` *(Postgres)* | FOR UPDATE serializes concurrent recovery; exactly one succeeds |
| `test_outbox_not_double_processed` *(Postgres)* | SKIP LOCKED prevents duplicate publishes across workers |

---

## Real Data Replay

The configurable engine accepts **real public grocery records** as execution-replay inputs. Two attributed fixtures are bundled (extracted from the local USDA dumps, not scraped):

- **USDA FoodData Central — Branded Foods** (CC0, public domain). `fdcId=1871817`, "ORGANIC WHOLE MILK", brand HORIZON, owner Danone US LLC, GTIN `742365228407`, 1 GAL package. *Product identity only — FDC carries no retail prices.*
- **USDA AMS Specialty Crops Market News — Hart County KY Produce Auction Summary** (`AH_FV160`, May 20 2026, released by University of Kentucky / Center for Crop Diversification via USDA Federal-State Market News). Strawberries, 3-quart pails: low $8.00 / high $10.50 / **avg $9.25**. *Honest label: auction grower price, **not** retail advertised.*

**ShelfTrace does not decide the optimal price.** Real public data is used to create traceable execution-replay scenarios; store connectors stay simulated. The engineering trace shows full **source lineage** alongside the technical artifacts (outbox events, adapter receipts, reconciliation result, audit). See `/data-replay`.

---

## Agent-ready: the ShelfTrace MCP server

The broader industry direction (which this independent prototype is inspired by, **not** affiliated with) is that grocery-pricing *agents* will increasingly read live operational data through **MCP and streaming infrastructure**, and that decisions must be **explainable and traceable**, not black-box. ShelfTrace is built as exactly that kind of *system underneath the agent* — and it ships an MCP server so an agent can query its reliability layer directly.

`backend/app/mcp_server.py` (FastMCP, stdio) exposes ShelfTrace's **read-only** reliability surface as MCP tools:

| Tool | Answers |
|---|---|
| `shelftrace_list_batches` / `shelftrace_get_batch` | discover batches → their action ids |
| `shelftrace_get_decision_receipt` | the full Signal→…→Learned evidence chain for one action |
| `shelftrace_is_execution_verified` | did the approved price reach the shopper on **every** channel? |
| `shelftrace_is_measurement_eligible` | the **quality gate** — is this outcome trustworthy enough to learn from? |
| `shelftrace_list_regression_cases` | Override Memory — resolved failures that guard future batches |
| `shelftrace_explain` | a deterministic, evidence-grounded plain-English answer |

It is an **opt-in, isolated** entrypoint (its own module, never imported by the API or the test suite; `mcp` is an optional dependency), and every tool is **read-only** — no tool mutates state. It serves ShelfTrace's own simulated/demo data; there is no retailer or vendor integration.

```bash
cd backend && pip install ".[mcp]"
DATABASE_URL=<your shelftrace db> python -m app.mcp_server   # stdio
```

Register it with any MCP client (e.g. Claude Desktop / Claude Code) by pointing the client at that command. The agent can then *check execution reliability before it acts on, attributes, or learns from a price decision.*

### How the design maps to agent-readiness principles

| Agent-ready principle | ShelfTrace |
|---|---|
| **Clean, centralized data** (canonical catalogs, relationship graphs) | Product Match Workbench — canonical entities + relationship graph |
| **Digitized workflows** with visibility into how decisions are made & executed | Action Simulator + the **Decision Receipt** (one durable record of *how* a price decision was made and executed) |
| **Real-time market context** (not stale snapshots) | Market Signal Intake + Real Data Replay (public-source observations, provenance preserved) |
| **Feedback loops → measurable outcomes; a training harness** | **Measurement Quarantine** + **Override Memory / Regression Replay** |
| **Explainable, traceable decisions** via MCP / streaming | **Decision Receipt + Evidence Rail + Ask ShelfTrace**, now **MCP-accessible** (above) |

The differentiated point ShelfTrace adds on top: *you should only measure or learn from a price action **after its shopper-facing execution is verified*** — the `shelftrace_is_measurement_eligible` gate makes that callable by an agent.

## What this is — and is not

**Is:** an adjacent prototype exploring safe rollout, verification, and recovery around AI-approved price *execution*, using simulated adapters and sample data.

**Is not:** a real POS/ESL integration, a pricing or demand model, a product matcher, a competitor scraper, or any claim about another company's internal systems. Channel adapters are mocks; prices and projections are illustrative upstream context, not computed here.

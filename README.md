# ShelfTrace Control Plane

**Test every connector before go-live. Guard every price rollout after approval.**

### 🎬 Live demo

| | |
|---|---|
| **Cinematic pitch** | [shelf-trace.vercel.app/vision/keynote](https://shelf-trace.vercel.app/vision/keynote) |
| **Working platform** *(live data)* | [shelf-trace.vercel.app/operations](https://shelf-trace.vercel.app/operations) |
| **Engineering trace** *(pipeline + tests)* | [shelf-trace.vercel.app/engineering](https://shelf-trace.vercel.app/engineering) |
| **Build your own scenario** | [shelf-trace.vercel.app/scenarios](https://shelf-trace.vercel.app/scenarios) |
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
 Outbox worker (Redis-modeled)  ── drains pending events
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
| Data | PostgreSQL (transactional state + outbox), Redis (delivery worker) |
| Infra | Docker Compose; Azure-ready |

### Backend design highlights

- **Idempotency** — the same `idempotency_key` always maps to one workflow; a duplicate POST never creates a second batch or duplicate publish work.
- **Transactional outbox** — batch, actions, rollout groups, and outbox events are committed in a single transaction. No publish work is queued unless the whole batch persists.
- **Reconciliation rules** — pure decision logic: any mismatch → blocked (critical), any timeout → retry, all verified → eligible. Expansion never includes unresolved actions.
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
- `/engineering` — execution trace: outbox events, raw adapter receipt, reconciliation result, test proof

---

## Tests

```bash
cd backend
pip install -e ".[dev]"

# SQLite (fast, 13 tests; the 2 Postgres-only concurrency tests skip):
pytest

# Against the docker Postgres (all 15, including row-lock concurrency):
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

## What this is — and is not

**Is:** an adjacent prototype exploring safe rollout, verification, and recovery around AI-approved price *execution*, using simulated adapters and sample data.

**Is not:** a real POS/ESL integration, a pricing or demand model, a product matcher, a competitor scraper, or any claim about another company's internal systems. Channel adapters are mocks; prices and projections are illustrative upstream context, not computed here.

# ShelfTrace — Where It Fits Alongside BetterBasket

> **One line:** Athena decides the price and pushes it. ShelfTrace proves it
> actually landed — identically across shelf label, register, and website —
> and contains the rollout when it didn't. It is the execution-integrity layer
> that makes a pricing AI's post-launch analytics trustworthy.

This is an **independent prototype** inspired by BetterBasket's public workflow.
No affiliation, no real retailer systems, no live integrations. Every claim
below maps to a test or an endpoint in this repo.

---

## BetterBasket's loop (from their own site)

BetterBasket runs pricing as seven agents — paraphrased from betterbasket.com:

```
1 Strategy   → define goals, margins, competitors, scope
2 Scraping   → collect competitor prices per location, daily
3 Matching   → match UPC / private-label / fresh across competitors
4 Data       → ingest + clean your POS/cost/invoice data (any file type)
5 Pricing    → recommend price changes, project revenue/margin/units
6 Back-office→ PUSH approved changes directly to POS  ("123 changes, 1 zone, 4 stores")
7 Analyst    → MEASURE lift vs projection, refine the models
```

That loop is excellent at **deciding** the price. It is the right tool for
steps 1–5, and ShelfTrace does not try to rebuild any of them — no scraper, no
matching algorithm, no elasticity model, no recommendations, no Athena clone.

## The seam — between step 6 and step 7

Look at the handoff their own copy describes:

```
6 Back-office  →  "Athena pushes approved price changes directly to POS systems"
                                    │
                                    │   ← assumed correct. nothing here verifies
                                    │      the shelf label and the website now
                                    │      match the register, or halts when the
                                    │      4 canary stores disagree.
                                    ▼
7 Analyst      →  "measure lift, compare to projections"
```

Between **push** (6) and **measure** (7) there is a silent, load-bearing
assumption: *that the approved price actually executed — correctly and
identically — on every shopper-facing surface.* Their described loop pushes to
**POS**, assumes success, and measures sales. It says nothing about:

- verifying the **shelf label (ESL)** and **ecommerce** surfaces match the register,
- **halting** the rollout when the canary stores disagree,
- recovering a failed execution before it spreads,
- or telling the Analyst Agent **which actions are even valid to measure.**

**That seam is ShelfTrace.** It is real, and it is invisible in their own
seven-step description.

## The single best argument: trustworthy analytics

Their **Analyst Agent attributes lift to a price change.** That attribution is
only valid if the change *actually reached the shopper.* If Athena pushed $2.75
but the register still rings $2.99, the Analyst Agent is measuring a change that
never happened — **the lift number is poisoned.**

ShelfTrace's **Measurement Eligibility** derivation answers exactly this: it
marks each executed action `ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED` only when
POS + ESL + ecommerce all confirm the approved price, and excludes the rest
(mismatch / awaiting-ack / recovery-incomplete) so they never poison the math.

> **ShelfTrace does not compete with Athena's analytics. It makes them
> trustworthy.** Step 7 assumes step 6 worked; ShelfTrace proves it did and
> quarantines the ones that didn't.
> *(See `app/services/measurement.py`, `test_measurement.py`,
> `test_measurement_integrity.py`.)*

---

## What is genuinely ShelfTrace's (no overlap with their 7 agents)

| Capability | What it does | Evidence in repo |
|---|---|---|
| **Plausibility guard** | Flags an approved price that looks like a *data error* at the execution gate — decimal slip ($4.90→$0.49), below-cost, one store wildly off the batch median | `services/plausibility.py`, `test_plausibility.py`, `GET /batches/{id}/plausibility` |
| **Cross-surface reconciliation** | Independent receipts from POS + ESL + ecommerce, compared to the approved price | `services/reconciliation.py`, `test_reconciliation.py` |
| **Canary containment** | One canary mismatch holds the whole batch; expansion hard-refused until verified | `services/orchestrator.py`, `test_canary.py` |
| **Incident recovery w/ ownership** | Acknowledge → retry → resolve, never un-owned, full audit trail | `services/recovery.py`, `test_acknowledgement.py`, `test_recovery.py` |
| **Measurement-eligibility gate** | Tells a downstream analytics layer which actions are valid to attribute | `services/measurement.py` |

Their published case studies (Econo +7%, the specialty chain +26ppt promo lift)
talk **only** about decide-better-prices → measure-better-outcomes. Neither
mentions execution correctness, shelf-vs-register mismatch, price-integrity
incidents, canary halting, or recovery. Execution is treated as solved plumbing
("single-click sync"). ShelfTrace's entire product lives in that blind spot.

---

## The one distinction to never blur

Their **Data Agent (step 4)** also "validates, cleans, normalizes" data — so do
**not** pitch ShelfTrace as "we validate data and they don't." The honest,
defensible line:

- **Their Data Agent validates data coming IN** — vendor invoices, cost feeds,
  PDF/CSV parsing at *ingest time.*
- **ShelfTrace's plausibility guard checks the approved price going OUT** — the
  last line of defense at the *execution gate*, immediately before a shopper is
  charged.

Same word ("validate"), different stage, different stakes. Ingest-clean vs
execution-gate. State it precisely; blur it and the distinction collapses.

## Tie it to their own KVI finding

Econo's case study reports: *"30% of products drove 70% of incremental sales"* —
the KVI insight. ShelfTrace already flags `is_kvi`. So:

> *An execution error on a KVI item — the 30% that drive 70% of your lift — is
> the most expensive thing to get wrong, and it's exactly what a post-push loop
> can't see. ShelfTrace surfaces KVI execution failures first.*

This ties the product directly to BetterBasket's **own published** result.

---

## The honest boundary (what ShelfTrace is NOT)

- Not a pricing engine, demand model, scraper, or product matcher — those are
  Athena's job and ShelfTrace defers to them.
- Not a real POS/ESL/ecommerce integration — the channel adapters are mocks;
  the adapter pattern is designed to be swapped for real connectors.
- Not affiliated with BetterBasket. Independent prototype, fictional store
  contexts, synthetic data.
- The plausibility thresholds are conservative heuristics (explainable by
  design), not learned models, and are not yet zone-pricing-aware.

## The pitch, in three sentences

1. Your pricing AI is great at deciding the price; the risk is everything that
   happens *after* it presses "push."
2. ShelfTrace is the execution-integrity layer that proves the approved price
   landed on every shopper-facing surface, contains the rollout when it didn't,
   and only lets verified actions into your lift analytics.
3. It complements Athena — it makes her decisions provably real — rather than
   competing with her.

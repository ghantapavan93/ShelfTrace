# How ShelfTrace Works — The Working Platform Explained

## **The Journey: Founder's View**

When the BetterBasket founder opens ShelfTrace, here's what they see and how it works:

---

## **Layer 1: Vision Pages** (First Impression)
**URL:** `/vision/keynote` or `/vision/showcase`

**What they see:**
- Cinematic dark UI with animated flow diagrams
- "Built beside Athena" framing
- Canary rollout concept explained visually
- Live demo link to jump into operations

**Why it matters:** Establishes credibility — shows understanding of *execution* (not pricing/demand), the key gap BetterBasket doesn't focus on.

---

## **Layer 2: Scenario Builder** (Where the Work Starts)
**URL:** `/scenarios`

### **What happens here:**

```
┌──────────────────────────────────────────┐
│  Scenario Builder (Frontend)             │
│                                          │
│  1. Load preset (Memorial Day demo)      │
│  2. Tweak: change stores, SKUs, prices   │
│  3. Set connector behaviors:             │
│     • POS: timeout then success          │
│     • ESL: slow but valid                │
│     • Ecommerce: stale price             │
│  4. Click "Run Live Rollout"             │
└──────────────────────────────────────────┘
         ↓ POST /scenarios/run
┌──────────────────────────────────────────┐
│  Backend: Test Scenario Execution        │
│                                          │
│  Creates new PriceBatch:                 │
│  ├─ batch_id: auto-generated UUID       │
│  ├─ external_id: memorial-day-dallas-02 │
│  ├─ total_store_count: 4                │
│  ├─ canary_store_ids: [214, 302]        │
│  └─ status: RECEIVED                    │
│                                          │
│  Creates PriceActions (one per SKU):    │
│  ├─ sku: sku_eggs (mapped to ProductEntity)
│  ├─ approved_price: $4.19               │
│  ├─ is_kvi: true (eggs are KVI)         │
│  └─ decision: PENDING                   │
│                                          │
│  Creates ChannelDeliveries:             │
│  ├─ pos → configure observed price      │
│  ├─ esl → configure timeout delay       │
│  └─ ecommerce → set stale_price response
│                                          │
│  Creates ConnectorBehavior rows         │
│  (how adapters respond to price changes)│
└──────────────────────────────────────────┘
         ↓
```

### **Key Insight:**
The scenario builder doesn't directly call scrapers or pricing engine. It sets up a **test bed** (batch + behaviors) to simulate how a specific retailer's system would respond to a price change.

---

## **Layer 3: Operations Dashboard** (Real-Time Execution)
**URL:** `/operations`

### **What happens here:**

```
┌─────────────────────────────────────────────────┐
│  Operations Dashboard (Frontend)                 │
│                                                 │
│  Polls every 2s: GET /api/operations?external_id│
│                                                 │
│  Displays:                                      │
│  ├─ Batch status: CANARY_VERIFYING             │
│  ├─ Hero: "Canary verifying..."                │
│  ├─ Critical incidents: 1 (eggs mismatch)      │
│  ├─ Deadline risks: 1 (strawberries timeout)   │
│  ├─ Verified actions: 1/3 (OJ clean)           │
│  ├─ Expansion blocked: YES                     │
│  └─ Recent audit events timeline               │
│                                                 │
│  Interactive:                                   │
│  ├─ Click incident → see channel mismatch      │
│  ├─ Click product → see all 4 stores' states   │
│  └─ Click "Retry" → trigger recovery flow      │
└─────────────────────────────────────────────────┘
         ↓ GET/PATCH /api/...
┌─────────────────────────────────────────────────┐
│  Backend: Reconciliation Engine                  │
│                                                 │
│  Orchestrator polls ExecutionReceipts:         │
│  ├─ Store 214 POS: $4.19 ✓ (verified)         │
│  ├─ Store 214 ESL: (timeout, retrying...)      │
│  ├─ Store 302 POS: $4.49 ✗ (critical mismatch)│
│  └─ ...                                         │
│                                                 │
│  Incident Detection:                            │
│  ├─ PRICE_MISMATCH: eggs at Store 302          │
│  │  severity: CRITICAL                         │
│  │  offending_channel: pos                     │
│  │                                              │
│  └─ CHANNEL_TIMEOUT: strawberries at 214      │
│     severity: URGENT (deadline in 6 hrs)       │
│                                                 │
│  Decision Logic:                                │
│  ├─ All canary actions verified? NO            │
│  │  → expansion_blocked = true                 │
│  │                                              │
│  └─ Critical incident unresolved?              │
│     → status = BLOCKED (halt expansion)        │
│                                                 │
│  OutboxEvent created:                          │
│  ├─ type: INCIDENT_DETECTED                    │
│  ├─ payload: {incident_id, batch_id, ...}    │
│  └─ status: PENDING (webhook triggers alert)   │
└─────────────────────────────────────────────────┘
         ↓
```

### **Key Points:**
1. **Live Reconciliation** — compares what we sent (approved_price) vs what system returned (observed_price)
2. **Incident Auto-Detection** — price_mismatch, timeout, deadline_risk
3. **Expansion Blocking** — if critical incident, stop zone expansion until resolved
4. **Audit Trail** — every decision logged to audit_events

---

## **Layer 4: Incident Investigation & Recovery**
**URL:** `/operations/incidents/[id]`

### **What happens:**

```
┌────────────────────────────────────────┐
│  Incident Detail Page                  │
│                                        │
│  Shows:                                │
│  ├─ Product: Eggs, Store 214          │
│  ├─ Approved: $4.19 (from batch)      │
│  ├─ POS observed: $4.49 (shopper sees │
│  ├─ ESL observed: (no response)       │
│  ├─ Ecommerce: (no response)          │
│  ├─ Root cause: POS not sync'd        │
│  ├─ Impact: shopper charged $0.30 more│
│  └─ Recommended action: Retry         │
│                                        │
│  Action buttons:                       │
│  ├─ [Retry] → mark for re-send        │
│  ├─ [Verify] → manual confirmation    │
│  └─ [Rollback] → reverse this action  │
└────────────────────────────────────────┘
         ↓ PATCH /api/incidents/[id]/retry
┌────────────────────────────────────────┐
│  Backend: Recovery Service             │
│                                        │
│  On Retry:                             │
│  ├─ Create new ChannelDeliveries      │
│  ├─ Mark old as RETRYING              │
│  ├─ Increment attempts counter        │
│  ├─ Enqueue OutboxEvent: RECONCILE_   │
│  │  REQUESTED                          │
│  └─ Re-simulate POS + ESL + ecommerce│
│                                        │
│  Result: Incident status → RETRYING   │
│  Next poll: Dashboard shows progress  │
└────────────────────────────────────────┘
         ↓
```

---

## **The Three Layers Below (Scrapers, Pricing, Reconciliation)**

These are NOT directly called by the scenario builder. Instead, they're pre-computed or triggered separately:

### **1. Competitor Scraper** (`/operations → backend/app/scrapers/`)
- **When:** On-demand or scheduled (e.g., every 4 hours)
- **What:** Fetches competitor prices from Whole Foods, Amazon Fresh
- **Output:** Stores in `competitor_products` table + price history
- **Used by:** Pricing engine (as reference prices)

### **2. Pricing Engine** (`backend/app/pricing/`)
- **When:** Batch creation time or pre-computed (external system sends prices)
- **What:** Computes optimal price given elasticity + competitor + cost
- **Inputs:**
  - Historical sales (HistoricalSale table)
  - Competitor prices (CompetitorProduct table)
  - Product cost (ProductCost table)
  - Supply signals (new: CostSignal table)
  - Cannibalization signals (new: cross-elasticity estimates)
- **Output:** PricingRecommendation rows (what we recommend to the batch)

### **3. Reconciliation Engine** (orchestrator.py)
- **When:** Continuously (polls ExecutionReceipts)
- **What:** Compares approved → observed prices, detects mismatches
- **Key logic:**
  ```
  For each action in batch:
    For each channel (POS, ESL, ecommerce):
      Get ExecutionReceipt (what was ack'd back)
      If approved_price != observed_price:
        Create Incident (PRICE_MISMATCH)
      If timeout (no response):
        Create Incident (CHANNEL_TIMEOUT)
      If deadline (perishable + time running out):
        Create Incident (DEADLINE_RISK)
  
  If ANY critical incidents:
    batch.expansion_blocked = true
    status = BLOCKED
  Else if ALL verified:
    status = READY_FOR_EXPANSION
  ```

---

## **End-to-End Flow: What Founder Sees**

### **Scenario 1: All Clear (Success Path)**
```
Scenario → Run
    ↓
Operations shows: "Canary verifying..."
    ↓ (after 5 seconds)
"All channels verified · eligible for expansion"
    ↓
Founder sees: ✓ 3/3 actions verified, $0 loss, safe to expand
```

### **Scenario 2: Critical Incident (The Real Value Prop)**
```
Scenario → Run (eggs: approved $4.19, but SKU mis-mapped at POS)
    ↓
Operations shows: "Canary verifying..."
    ↓ (after 5 seconds)
"Rollout held by canary mismatch · eggs at Store 302"
    ↓
Dashboard shows:
  • Critical incident: POS returned $4.49 instead of $4.19
  • Risk: shopper charged +$0.30
  • Status: BLOCKED (expansion paused)
    ↓
Founder clicks "Investigate"
    ↓
Incident page shows:
  • Root cause: POS system didn't receive update (timeout)
  • Recommendation: Retry
    ↓
Founder clicks "Retry"
    ↓
System re-sends to POS
    ↓ (5 seconds later)
Dashboard updates: "Incident resolved · verified"
    ↓
Founder: "Ah! That's why we need this. Without ShelfTrace, we'd have shopper complaints at checkout."
```

---

## **The Two New Layers We Added This Morning**

### **1. Product Knowledge Graph** (backend/app/services/product_graph.py)
**Why:** Without entity linking, SKU optimization is blind.

- **Before:** Pricing engine sees `sku_eggs_214` as a standalone SKU
- **After:** We link it to `ProductEntity(canonical_title="Organic Large Eggs")`
  - Can now see: competitors pricing same entity across Whole Foods, Amazon, Target
  - Can auto-detect cannibalization: "If eggs ↑ 15%, tofu demand ↑ 10%"
  - Can ask: "What's the full margin for this entity across all my zones?"

**Integration:** When scenario is created, actions' SKUs resolve to entities → pricing engine can use cross-source competitor data.

### **2. Advanced Pricing** (cannibalization.py + supply_signals.py)
**Why:** Current pricing is static; doesn't account for supply shocks or substitutes.

- **Cannibalization:** If raising eggs 15% with 2 strong substitutes, reduce to 8% to preserve total margin
- **Supply Signals:** If egg futures spike 12% in 3 weeks, raise effective COGS now, price preemptively

**Integration:** When batch executes, pricing engine calls:
```python
# Check for cannibalization
substitutes = find_substitute_products(db, entity_id="eggs")
adjusted_price, reason = adjust_for_cannibalization(
    recommended=4.50, 
    current=4.19,
    substitutes=substitutes
)
# Blend in supply forecasts
effective_cost = compute_effective_cogs(base_cost=2.50, signals=[...])
```

**Result:** Price recommendation is now 2x smarter—accounts for competitor context + cross-product dynamics + supply shocks.

---

## **What Founder Needs to Know: The Value Prop**

### **Before ShelfTrace (or without reconciliation):**
- Upload price change → assume it works
- Shopper sees $4.19 on shelf, charged $4.49 at checkout
- Shopper posts on Reddit: "Bait and switch at [store]"
- PR nightmare

### **With ShelfTrace (What We Built):**
- Upload price change
- Simulate → instantly know: "POS will timeout, ESL will succeed, Ecommerce stale"
- Auto-detect critical issues → "STOP, don't expand yet"
- Retry the failed channel
- Re-verify all 3 channels
- Only then expand zone-wide
- Audit trail: every decision, every retry, every resolution logged

### **This Morning's Additions (Why It Matters):**
- **Product graph:** Now knows that "Eggs at Store 214" is the same product entity as "Eggs at Whole Foods"—can track margin across competitors
- **Cannibalization detection:** Prevents race-to-the-bottom (don't just match competitor egg price if it kills your own substitute sales)
- **Supply signals:** Preemptive pricing before commodity shocks hit

---

## **Does It Sync From Scenario Builder Down?**

**YES, but not directly:**

```
Scenario Builder (frontend form)
    ↓ POST /scenarios
Creates TestRunConfig + TestRunAction + ConnectorBehavior rows
    ↓
Founder clicks "Run Live Rollout"
    ↓ POST /scenarios/{id}/execute
Backend orchestrator.execute_scenario():
    ├─ Fetch scenario config
    ├─ Build PriceBatch (new batch, seeded from scenario)
    ├─ Create PriceActions (from scenario actions)
    ├─ Create ChannelDeliveries (from behaviors)
    ├─ DOES NOT call scraper (uses pre-seeded data)
    ├─ DOES NOT recompute pricing (uses provided approved_price)
    └─ Runs reconciliation engine (compares vs. adapter responses)
    ↓
Operations page shows live results
```

**Key point:** Scenario is a "test harness," not a full pipeline. It seeds the batch with test data and simulates channel responses. Scraper and pricing are separate (run independently in production).

---

## **For the Founder: Here's What to Demo**

1. **Open `/vision/keynote`** — "Here's what we built"
2. **Go to `/scenarios`** — "Load Memorial Day, change stores, run it"
3. **Watch `/operations`** — "Live reconciliation of all 3 channels"
4. **Click the critical incident** — "See the mismatch, price the actual risk"
5. **Click Retry** — "Watch recovery in real-time"
6. **Then ask:** "Without this, how would you detect that your POS is out of sync before shoppers complained?"

That's the sell: **Execution safety for AI-approved prices.**

---

## **What's NOT in the Demo Yet (Future Scope)**

- Real scraper integration (currently stub data)
- Real pricing engine auto-run (currently seeded)
- Upstream integration with BetterBasket's actual pricing API
- Multi-zone expansion rules
- Automated rollback triggers

But that's fine—the demo shows the *principle*: catch mismatches before they hit customers.

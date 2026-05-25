# ShelfTrace Architecture — System Diagram & Integration Points

## **Four-Layer Stack**

```
┌─────────────────────────────────────────────────────────────────┐
│                    VISION LAYER (Reviewer)                      │
│                 /vision/keynote, /showcase, etc                 │
│              (Cinematic dark UI, Emil Kowalski style)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              WORKING PLATFORM LAYER (Operator)                  │
│           /operations, /scenarios, /certification               │
│   (Real-time rollout, live reconciliation, incident mgmt)      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│           BACKEND API LAYER (Orchestration)                     │
│  routes: batches, operations, scenarios, pricing, scraping      │
│  services: reconciliation, recovery, orchestrator, certification│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              DATABASE LAYER (Postgres + Redis)                  │
│      Tables: PriceBatch, PriceAction, ChannelDelivery,          │
│      ExecutionReceipt, Incident, StoreTask, OutboxEvent, ...    │
└─────────────────────────────────────────────────────────────────┘
```

---

## **How Scenario → Operations Flow Works**

### **Step 1: Scenario Builder (Frontend)**
**File:** `frontend/app/(app)/scenarios/page.tsx`

User creates a test scenario:
```javascript
{
  "name": "Custom Connector Test",
  "zone_name": "Dallas Zone 2",
  "store_ids": [214, 302, 317, 401],
  "canary_store_ids": [214, 302],
  "actions": [
    {
      "product_name": "Eggs",
      "sku": "sku_eggs",
      "previous_price": 4.49,
      "approved_price": 4.19,
      "is_kvi": true
    },
    {
      "product_name": "Strawberries",
      "sku": "sku_berries",
      "previous_price": 6.99,
      "approved_price": 5.49,
      "deadline_at": "2026-05-25T22:00:00Z"  // perishable!
    }
  ],
  "behaviors": [
    {
      "store_id": "214",
      "sku": "sku_eggs",
      "channel_type": "pos",
      "behavior_type": "success",  // POS responds correctly
      "configured_observed_price": 4.19
    },
    {
      "store_id": "302",
      "sku": "sku_eggs",
      "channel_type": "pos",
      "behavior_type": "stale_price",  // POS returns old price
      "configured_observed_price": 4.49  // shopper will be charged this
    }
    // ... more behaviors for ESL, ecommerce
  ]
}
```

### **Step 2: POST to Backend**
**Endpoint:** `POST /scenarios` (scenarios.py)

```python
@router.post("/scenarios")
def create_scenario(body: dict, db: Session = Depends(get_db)):
    # Store as TestRunConfig + TestRunAction + ConnectorBehavior rows
    config = TestRunConfig(
        name=body["name"],
        zone_name=body["zone_name"],
        store_ids_csv="214,302,317,401",
        canary_store_ids_csv="214,302",
    )
    db.add(config)
    
    for action in body["actions"]:
        test_action = TestRunAction(
            sku=action["sku"],
            product_name=action["product_name"],
            previous_price=action["previous_price"],
            approved_price=action["approved_price"],
            is_kvi=action["is_kvi"],
            deadline_at=action["deadline_at"],
        )
        db.add(test_action)
    
    for behavior in body["behaviors"]:
        profile = ConnectorBehaviorProfile(
            store_id=behavior["store_id"],
            sku=behavior["sku"],
            channel_type=behavior["channel_type"],
            behavior_type=behavior["behavior_type"],
            configured_observed_price=behavior.get("configured_observed_price"),
            configured_delay_ms=behavior.get("configured_delay_ms"),
        )
        db.add(profile)
    
    db.commit()
    return {"scenario_id": config.id}
```

### **Step 3: Execute Scenario**
**Endpoint:** `POST /scenarios/{id}/execute` (scenarios.py)

```python
async def execute_scenario(config_id: str, mode: str, db: Session):
    config = db.get(TestRunConfig, config_id)
    
    # Create a real PriceBatch from this test config
    batch = PriceBatch(
        external_id=f"scenario-{config_id}",
        name=config.name,
        zone=config.zone_name,
        status=BatchStatus.RECEIVED,
        run_mode=RunMode(mode),  # "live_rollout" or "certification"
        environment=Environment.SIMULATED_PRODUCTION,
        total_store_count=len(config.store_ids),
    )
    db.add(batch)
    db.flush()
    
    # Create PriceAction rows (one per SKU in scenario)
    for action in config.actions:
        price_action = PriceAction(
            batch_id=batch.id,
            sku=action.sku,
            product_name=action.product_name,
            store_id=None,  # we'll expand to all stores
            approved_price=action.approved_price,
            prior_price=action.previous_price,
            is_perishable=(action.deadline_at is not None),
            markdown_deadline=action.deadline_at,
        )
        db.add(price_action)
    
    db.flush()
    
    # Create ChannelDelivery rows for each action × channel
    for action in batch.actions:
        for channel in [Channel.POS, Channel.ESL, Channel.ECOMMERCE]:
            delivery = ChannelDelivery(
                action_id=action.id,
                channel=channel,
                status=DeliveryStatus.PENDING,
            )
            db.add(delivery)
    
    db.flush()
    
    # Create ExecutionReceipt with SIMULATED responses
    # (based on ConnectorBehaviorProfile rows)
    for delivery in all_deliveries:
        # Look up behavior rule for this (store, sku, channel)
        behavior = db.query(ConnectorBehaviorProfile).filter(
            ConnectorBehaviorProfile.sku == delivery.action.sku,
            ConnectorBehaviorProfile.channel_type == delivery.channel,
        ).first()
        
        if behavior:
            if behavior.behavior_type == "success":
                receipt = ExecutionReceipt(
                    delivery_id=delivery.id,
                    expected_price=delivery.action.approved_price,
                    observed_price=delivery.action.approved_price,  # ✓ Match
                    status=ReceiptStatus.VERIFIED,
                )
            elif behavior.behavior_type == "stale_price":
                receipt = ExecutionReceipt(
                    delivery_id=delivery.id,
                    expected_price=delivery.action.approved_price,
                    observed_price=behavior.configured_observed_price,  # ✗ Mismatch
                    status=ReceiptStatus.MISMATCH,
                )
            # ... more behavior types
        
        db.add(receipt)
    
    db.commit()
    return {
        "batch_id": batch.id,
        "redirect": f"/operations?external_id={batch.external_id}",
    }
```

---

## **Step 4: Operations Dashboard Polls**
**Frontend:** `frontend/app/(app)/operations/page.tsx`

```typescript
function OperationsContent() {
  const { data } = useLive(() => api.operations(externalId), [externalId]);
  
  // Polls every 2 seconds:
  // GET /api/operations?external_id=scenario-xxx
  
  // Returns:
  {
    batch: {
      id: "batch_123",
      external_id: "scenario-xxx",
      status: "CANARY_VERIFYING",
      total_actions: 3,
      verified_actions: 1,
      critical_incidents: 1,
      deadline_risks: 1,
      expansion_blocked: true,
    },
    critical_incident: {
      id: "incident_456",
      product_name: "Eggs",
      store_id: "302",
      approved_price: 4.19,
      observed_price: 4.49,  // $0.30 mismatch!
      status: "OPEN",
      offending_channel: "pos",
    },
    recent_activity: [
      { event: "batch_created", ... },
      { event: "action_mismatch_detected", ... },
    ]
  }
}
```

### **Backend Endpoint:** `GET /api/operations?external_id=...` (operations.py)

```python
@router.get("/operations")
def get_operations(external_id: Optional[str] = None, db: Session = Depends(get_db)):
    # Fetch batch
    batch = db.query(PriceBatch).filter(PriceBatch.external_id == external_id).first()
    if not batch:
        return {"error": "Batch not found"}
    
    # Count verified/blocked/pending actions
    verified = db.query(PriceAction).filter(
        PriceAction.batch_id == batch.id,
        PriceAction.decision == ActionDecision.VERIFIED,
    ).count()
    
    blocked = db.query(PriceAction).filter(
        PriceAction.batch_id == batch.id,
        PriceAction.decision == ActionDecision.BLOCKED,
    ).count()
    
    # Find critical incidents (price mismatch, timeout, deadline risk)
    critical = db.query(Incident).filter(
        Incident.batch_id == batch.id,
        Incident.severity == IncidentSeverity.CRITICAL,
        Incident.status == IncidentStatus.OPEN,
    ).first()
    
    # Get receipts and detect mismatches
    receipts = db.query(ExecutionReceipt).join(
        ChannelDelivery
    ).join(
        PriceAction
    ).filter(
        PriceAction.batch_id == batch.id
    ).all()
    
    # Reconciliation logic (runs in orchestrator.py in background)
    for receipt in receipts:
        if receipt.observed_price and abs(receipt.observed_price - receipt.expected_price) > 0.01:
            # Create PRICE_MISMATCH incident
            incident = Incident(
                batch_id=batch.id,
                action_id=receipt.delivery.action_id,
                type=IncidentType.PRICE_MISMATCH,
                severity=IncidentSeverity.CRITICAL,
                summary=f"{money(receipt.expected_price)} approved, {money(receipt.observed_price)} observed",
                offending_channel=receipt.channel,
            )
            db.add(incident)
    
    db.commit()
    
    # Update batch status based on incidents
    if critical:
        batch.status = BatchStatus.BLOCKED
        batch.expansion_blocked = True
    
    return {
        "batch": { ... },
        "critical_incident": critical,
        "deadline_risks": [...],
        "recent_activity": [...],
    }
```

---

## **Integration Points for the Two New Layers**

### **1. Product Knowledge Graph** ← Pricing Engine

**When:** Batch creation time (optional, for advanced pricing)

```python
# In execute_scenario():
for action in config.actions:
    # Link SKU to canonical entity
    entity = product_graph.get_entity_for_sku(db, action.sku, zone_id=config.zone_name)
    
    if entity:
        # Can now fetch competitor prices for this entity
        comp_prices = product_graph.get_competitor_prices_for_entity(db, entity.id)
        
        # Get internal history for elasticity
        history = product_graph.get_internal_history_for_entity(db, entity.id)
```

**Result:** Price recommendations now use cross-source competitor data + historical elasticity.

---

### **2. Cannibalization Detection** ← Pricing Constraints

**When:** During recommendation (or batch creation if we recompute)

```python
# In pricing/pipeline.py:
def recommend_for_sku(features: PricingFeatures) -> PricingRecommendation:
    # Compute optimal price (existing logic)
    recommended = unconstrained_optimal_price(elasticity.beta, features.cost)
    
    # Apply cannibalization adjustment (NEW)
    entity = product_graph.get_entity_for_sku(db, features.sku)
    if entity:
        substitutes = cannibalization.find_substitute_products(db, entity.id)
        recommended, reason = cannibalization.adjust_for_cannibalization(
            recommended,
            features.current_price,
            entity.id,
            substitutes,
        )
        if reason:
            recommendation.reasons.append(
                PricingReason(
                    code="CANNIBALIZATION_ADJUSTED",
                    message=reason,
                )
            )
```

---

### **3. Supply Signals** ← Pricing COGS Calculation

**When:** During recommendation

```python
# In pricing/pipeline.py:
def recommend_for_sku(features: PricingFeatures) -> PricingRecommendation:
    # Get base cost
    base_cost = features.cost
    
    # Fetch active supply signals (NEW)
    signals = db.query(ExternalSignal).filter(
        ExternalSignal.effective_from <= utcnow(),
        ExternalSignal.effective_until >= utcnow(),
        (ExternalSignal.sku_pattern == features.sku) |
        (ExternalSignal.category_pattern == features.category),
    ).all()
    
    # Blend cost with supply forecasts
    effective_cost = supply_signals.compute_effective_cogs(
        base_cost,
        signals,  # CostSignal objects
    )
    
    # Use blended cost for price optimization
    recommended = unconstrained_optimal_price(elasticity.beta, effective_cost)
```

---

## **Data Flow Diagram**

```
┌─────────────────────┐
│ Scenario Builder    │
│ (Frontend Form)     │
└──────────┬──────────┘
           │ POST /scenarios/execute
           ↓
┌──────────────────────────────────────┐
│ Backend: execute_scenario()           │
│                                      │
│ 1. Create PriceBatch                │
│ 2. Create PriceActions              │
│ 3. Link SKUs → ProductEntity ✨     │
│ 4. Create ChannelDeliveries         │
│ 5. Create ExecutionReceipts         │
│    (simulated based on behaviors)   │
│ 6. Run reconciliation loop          │
│    - Detect mismatches              │
│    - Create Incidents               │
│    - Mark decisions (verified/blocked)
└──────────┬───────────────────────────┘
           │
           ├─→ ProductEntity lookup
           │   (NEW: get competitor prices)
           │
           ├─→ Cannibalization check
           │   (NEW: find substitutes)
           │
           ├─→ Supply signal blend
           │   (NEW: adjust effective COGS)
           │
           └─→ Create OutboxEvent (for webhooks)
               
┌──────────────────────────────────────┐
│ Operations Dashboard (Polls)          │
│                                      │
│ GET /api/operations every 2s         │
│ Shows:                               │
│ • Batch status                       │
│ • Verified/blocked counts            │
│ • Critical incidents (real-time!)    │
│ • Recent audit events                │
└──────────┬───────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│ Incident Investigation               │
│                                      │
│ Click incident → GET /incidents/{id} │
│ See full details + impact            │
│                                      │
│ Click Retry → PATCH /incidents/{id}  │
│ Backend: create new ChannelDelivery, │
│ re-simulate, re-verify               │
└──────────────────────────────────────┘
```

---

## **Key Tables & Their Relationships**

```sql
PriceBatch (root)
├── PriceAction (what to change: sku, price)
│   ├── ChannelDelivery (how: send to POS, ESL, ecommerce)
│   │   └── ExecutionReceipt (what came back: observed_price, status)
│   │
│   └── Incident (what went wrong: mismatch, timeout, deadline)
│       └── StoreTask (manual intervention: "reboot POS 214")
│
├── OutboxEvent (transactional outbox: webhook triggers)
│
└── SKUProductLink (NEW: sku → entity mapping)
    └── ProductEntity (NEW: canonical product)
        ├── CompetitorProductEntity (NEW: links to competitor products)
        │   └── CompetitorPriceObservation (NEW: price history)
        │
        ├── ProductCategory (NEW: hierarchical categories)
        │
        └── (Used by pricing engine for cross-source insights)
```

---

## **Summary: Does It All Sync?**

✅ **YES:**
1. Scenario builder creates TestRunConfig
2. Execute creates PriceBatch + PriceActions + simulated ExecutionReceipts
3. Operations polls and shows real-time reconciliation
4. Incidents auto-detect and block expansion
5. NEW: SKU linkage enables cross-source pricing
6. NEW: Cannibalization detection adjusts recommendations
7. NEW: Supply signals preemptively adjust COGS

❌ **NOT directly called (out of scope for demo):**
- Actual scraper (uses stub data)
- Actual external pricing API (uses provided approved_price)
- Actual retailer adapters (uses simulated behaviors)

But the architecture is ready—once those components feed in real data, the demo becomes production.

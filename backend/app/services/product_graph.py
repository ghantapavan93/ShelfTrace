"""Product knowledge graph operations — entity matching, linkage, and normalization."""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    HistoricalSale,
    PriceAction,
    PriceBatch,
    ProductCategory,
    ProductEntity,
    ReceiptStatus,
    SKUProductLink,
)
from app.scope import Scope, apply_filter


def find_or_create_category(db: Session, category_name: str, parent_id: Optional[str] = None) -> ProductCategory:
    """Get existing category or create it. Useful for bootstrapping hierarchies."""
    stmt = select(ProductCategory).where(ProductCategory.name == category_name)
    existing = db.scalar(stmt)
    if existing:
        return existing

    cat = ProductCategory(id=f"cat_{category_name.lower().replace(' ', '_')}", name=category_name, parent_id=parent_id)
    db.add(cat)
    db.flush()
    return cat


def create_product_entity(
    db: Session,
    canonical_title: str,
    category_id: Optional[str] = None,
    brand: Optional[str] = None,
    manufacturer: Optional[str] = None,
    upc: Optional[str] = None,
    unit_size: Optional[str] = None,
    attributes: Optional[dict] = None,
    is_manual: bool = False,
) -> ProductEntity:
    """Create a canonical product entity (unifies across sources)."""
    import uuid

    entity = ProductEntity(
        id=f"pe_{uuid.uuid4().hex[:12]}",
        canonical_title=canonical_title,
        category_id=category_id,
        brand=brand,
        manufacturer=manufacturer,
        upc=upc,
        unit_size=unit_size,
        attributes=attributes or {},
        match_confidence=1.0 if is_manual else 0.0,
        is_manual=is_manual,
    )
    db.add(entity)
    db.flush()
    return entity


def title_similarity(title_a: str, title_b: str) -> float:
    """Simple title similarity score (0..1) via SequenceMatcher.
    Real systems use Levenshtein + phonetic matching."""
    return SequenceMatcher(None, title_a.lower(), title_b.lower()).ratio()


def auto_match_competitor_to_entity(
    db: Session, competitor_product: CompetitorProduct, min_score: float = 0.75
) -> Optional[ProductEntity]:
    """Try to find an existing entity matching this competitor product by title + category.
    Returns None if no good match found. Real systems would use ML ranking."""
    # Query entities with same or nearby category
    stmt = select(ProductEntity)
    if competitor_product.category:
        stmt = stmt.where(ProductEntity.category_id != None)  # noqa: E712

    candidates = db.scalars(stmt).all()

    best_entity = None
    best_score = 0.0

    for entity in candidates:
        sim = title_similarity(competitor_product.title, entity.canonical_title)
        if sim > best_score:
            best_score = sim
            best_entity = entity

    return best_entity if best_score >= min_score else None


def link_sku_to_entity(db: Session, sku: str, entity_id: str, zone_id: Optional[str] = None) -> SKUProductLink:
    """Link an internal SKU to a canonical entity. One SKU can link to one entity per zone."""
    import uuid

    link = SKUProductLink(
        id=f"skl_{uuid.uuid4().hex[:12]}",
        sku=sku,
        entity_id=entity_id,
        zone_id=zone_id,
    )
    db.add(link)
    db.flush()
    return link


def get_entity_for_sku(db: Session, sku: str, zone_id: Optional[str] = None) -> Optional[ProductEntity]:
    """Resolve a SKU to its canonical entity (zone-scoped if provided)."""
    stmt = select(SKUProductLink).where(SKUProductLink.sku == sku)
    if zone_id:
        stmt = stmt.where(or_(SKUProductLink.zone_id == zone_id, SKUProductLink.zone_id == None))

    link = db.scalar(stmt)
    if not link:
        return None

    return db.scalar(select(ProductEntity).where(ProductEntity.id == link.entity_id))


def get_competitor_prices_for_entity(
    db: Session,
    entity_id: str,
    zone_id: Optional[str] = None,
    scope: Scope = Scope.ALL,
) -> list[CompetitorPriceObservation]:
    """Get all recent competitor price observations for a canonical entity.
    Useful for 'what are competitors charging for this product?'

    `scope` honors the Live/Demo data boundary: when scope=LIVE the result
    excludes demo-seeded observations (and vice versa). Defaults to ALL so
    existing callers that don't care about scope are unaffected.
    """
    stmt = select(CompetitorPriceObservation).where(CompetitorPriceObservation.entity_id == entity_id)
    if zone_id:
        stmt = stmt.where(or_(CompetitorPriceObservation.zone_id == zone_id, CompetitorPriceObservation.zone_id == None))
    stmt = apply_filter(stmt, CompetitorPriceObservation.source_run_id, scope)

    return db.scalars(stmt).all()


def get_internal_history_for_entity(db: Session, entity_id: str, store_id: Optional[str] = None) -> list[HistoricalSale]:
    """Get all internal sales history for products linked to an entity.
    Useful for elasticity estimation with competitor context."""
    # Find all SKUs linked to this entity
    stmt = select(SKUProductLink.sku).where(SKUProductLink.entity_id == entity_id)
    skus = [row[0] for row in db.execute(stmt).all()]

    if not skus:
        return []

    # Get sales history for those SKUs
    hist_stmt = select(HistoricalSale).where(HistoricalSale.sku.in_(skus))
    if store_id:
        hist_stmt = hist_stmt.where(HistoricalSale.store_id == store_id)

    return db.scalars(hist_stmt).all()


# ---------------------------------------------------------------------------
# CPI integrity — is the competitor index built on the price that ACTUALLY rang?
# ---------------------------------------------------------------------------
# A competitor price index (CPI) compares the retailer's own "My Price" to
# competitor observations for the same canonical entity. "My Price" is usually
# the approved/intended price — not the price a channel verified on-shelf. If an
# approved price never executed (POS still rings the old price), a CPI computed
# on the intended price misstates competitive position and a category manager
# could reprice off a wrong number. ShelfTrace already knows the actually-
# verified price per channel, so it can flag whether each CPI input is
# execution-verified.
#
# This is **pure derivation** — no new tables, migrations, or write paths. It
# reuses the same verdict the measurement-eligibility module produces (so there
# is exactly one verification rule) plus the receipts the reconciliation engine
# already persisted.

# The three integrity verdicts a CPI input can carry.
CPI_VERIFIED = "verified"
CPI_UNVERIFIED = "unverified"
CPI_MISMATCH = "mismatch"


def _cpi_rank(status: str) -> int:
    """Severity rank so the worst verdict across a SKU's stores/links wins."""
    return {CPI_VERIFIED: 0, CPI_UNVERIFIED: 1, CPI_MISMATCH: 2}.get(status, 1)


def _actions_for_sku(db: Session, sku: str, scope: Scope = Scope.ALL) -> list[PriceAction]:
    """Every executed PriceAction for this SKU, scope-filtered, newest id first.

    Actions carry no source_run_id of their own — their batch does — so the
    Live/Demo filter is applied by joining ``PriceBatch.source_run_id``. The
    competitor index is computed per entity, not per store, so we look at every
    store's action: if any store rang a different price than the approved one,
    the entity-level "My Price" is not fully execution-verified.
    """
    stmt = (
        select(PriceAction)
        .join(PriceBatch, PriceAction.batch_id == PriceBatch.id)
        .where(PriceAction.sku == sku)
        .order_by(PriceAction.id.desc())
    )
    stmt = apply_filter(stmt, PriceBatch.source_run_id, scope)
    return list(db.scalars(stmt))


def _verdict_to_cpi_status(action: PriceAction, verdict) -> tuple[str, float | None]:
    """Map a measurement EligibilityResult to a CPI integrity status.

    Reuses the eligibility verdict (one verification rule) and, when a channel
    observed a different price than the approved one, surfaces that observed
    (ringing) price so the index can show observed-vs-intended.
    """
    from app.services.measurement import MeasurementEligibility

    # Find a mismatching receipt (a channel that rang a different price than the
    # approved value the index assumes). observed_price is the price it rang.
    mismatch_price: float | None = None
    for delivery in action.deliveries:
        receipt = delivery.receipt
        if receipt is not None and receipt.status == ReceiptStatus.MISMATCH:
            mismatch_price = receipt.observed_price
            break

    if verdict.status == MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED:
        return CPI_VERIFIED, None
    if mismatch_price is not None:
        return CPI_MISMATCH, mismatch_price
    # Awaiting ack / blocked-without-mismatch / pending / rollback all mean the
    # index assumes a price we have not confirmed on-shelf.
    return CPI_UNVERIFIED, None


def derive_cpi_integrity_for_entity(
    db: Session,
    entity: ProductEntity,
    scope: Scope = Scope.ALL,
) -> Optional[dict]:
    """Per-entity CPI integrity verdict, or None when the entity is not a CPI input.

    An entity is a CPI input only when it has at least one competitor price
    observation in the requested scope (those are the rows a CPI is built from).
    For such an entity we resolve the linked internal SKU(s), inspect every
    executed PriceAction across stores, and ask whether the approved price the
    index assumes is execution-verified:

      * ``verified``   — every required shopper-facing channel verified the
        approved price for every executed store, with nothing worse seen.
      * ``mismatch``   — a channel reported a different price than the index
        assumes at some store; ``observed_price`` carries that ringing price.
      * ``unverified`` — execution evidence is incomplete (pending / retrying /
        rolled back), or the SKU has no executed action yet.

    A mismatch at any store dominates: the index is built on one approved price
    per product, so a single store ringing a different price means the index
    misstates competitive position. The representative store/intended/observed
    is taken from the worst-ranked action. Returns a dict shaped for
    ``CpiIntegrityItem`` or None.
    """
    from app.services import measurement

    # Is this entity actually used as a CPI input? (has competitor observations)
    obs_count = db.scalar(
        apply_filter(
            select(func.count(CompetitorPriceObservation.id)).where(
                CompetitorPriceObservation.entity_id == entity.id
            ),
            CompetitorPriceObservation.source_run_id,
            scope,
        )
    )
    if not obs_count:
        return None

    # Resolve the internal SKU(s) linked to this entity (scope-filtered so a
    # Live-mode index input doesn't borrow a demo SKU's verdict).
    link_stmt = apply_filter(
        select(SKUProductLink).where(SKUProductLink.entity_id == entity.id),
        SKUProductLink.source_run_id,
        scope,
    )
    links = list(db.scalars(link_stmt))

    intended_price: float | None = None
    observed_price: float | None = None
    status = CPI_UNVERIFIED
    store_id: str | None = None
    sku: str | None = None
    chosen_executed = False  # True once an executed action has set the verdict

    # Walk every executed action for every linked SKU. Precedence:
    # mismatch > unverified > verified (a single bad channel poisons the input).
    # The newest action breaks ties (actions arrive newest-id-first).
    for link in links:
        actions = _actions_for_sku(db, link.sku, scope)
        if not actions:
            # Linked SKU never executed — the index assumes a price we can't
            # confirm at all. Keep it as the SKU context if nothing better yet.
            if sku is None:
                sku = link.sku
            continue

        for action in actions:
            verdict = measurement.derive_eligibility_for_action(db, action)
            item_status, item_observed = _verdict_to_cpi_status(action, verdict)

            # Seed on the first executed action, then let a worse verdict win.
            if not chosen_executed or _cpi_rank(item_status) > _cpi_rank(status):
                chosen_executed = True
                sku = link.sku
                store_id = action.store_id
                intended_price = action.approved_price
                observed_price = item_observed
                status = item_status

    return {
        "entity_id": entity.id,
        "canonical_title": entity.canonical_title,
        "sku": sku,
        "store_id": store_id,
        "intended_price": intended_price,
        "observed_price": observed_price,
        "status": status,
    }


def _cpi_summary(verified: int, unverified: int, mismatch: int) -> str:
    """Deterministic one-line summary built purely from the counts."""
    total = verified + unverified + mismatch
    if total == 0:
        return "No competitor-index inputs are linked to an executed price yet."
    if mismatch == 0 and unverified == 0:
        return f"All {total} competitor-index inputs are built on execution-verified prices."
    parts: list[str] = [f"{verified}/{total} index inputs are execution-verified"]
    if mismatch:
        parts.append(f"{mismatch} reflect a channel mismatch")
    if unverified:
        parts.append(f"{unverified} are not yet verified")
    return "; ".join(parts) + "."


def compute_cpi_integrity(db: Session, scope: Scope = Scope.ALL) -> dict:
    """Aggregate CPI integrity across every entity that is a competitor-index input.

    Returns a dict shaped for ``CpiIntegrityView``: the per-item verdicts plus
    aggregate counts and a deterministic summary. Only entities that actually
    carry competitor observations in ``scope`` are included — those are the rows
    a CPI is computed from.
    """
    # Entities that have at least one competitor observation in scope are the
    # index inputs. One scoped query gets their ids; we derive per entity.
    entity_id_stmt = apply_filter(
        select(CompetitorPriceObservation.entity_id)
        .where(CompetitorPriceObservation.entity_id.is_not(None))
        .group_by(CompetitorPriceObservation.entity_id),
        CompetitorPriceObservation.source_run_id,
        scope,
    )
    entity_ids = [row[0] for row in db.execute(entity_id_stmt).all()]

    items: list[dict] = []
    if entity_ids:
        entities = db.scalars(
            select(ProductEntity).where(ProductEntity.id.in_(entity_ids))
        ).all()
        # Stable order so the summary + UI are deterministic across runs.
        for entity in sorted(entities, key=lambda e: e.canonical_title):
            item = derive_cpi_integrity_for_entity(db, entity, scope)
            if item is not None:
                items.append(item)

    verified = sum(1 for i in items if i["status"] == CPI_VERIFIED)
    unverified = sum(1 for i in items if i["status"] == CPI_UNVERIFIED)
    mismatch = sum(1 for i in items if i["status"] == CPI_MISMATCH)

    return {
        "total_inputs": len(items),
        "verified": verified,
        "unverified": unverified,
        "mismatch": mismatch,
        "summary": _cpi_summary(verified, unverified, mismatch),
        "items": items,
    }

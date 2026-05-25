"""Pricing engine — what to charge, given competitor + history + cost.

Architecture mirrors the rest of app/: small focused modules, pure
functions where possible, every constraint named.

    pricing/
      __init__.py        (this — public surface)
      models.py          PricingFeatures / Elasticity / Recommendation dataclasses
      elasticity.py      OLS log-log estimator (β = ∂log Q / ∂log P)
      optimizer.py       Closed-form profit-max with constraint clipping
      constraints.py     KVI floor / perishable urgency / cost margin / etc.
      reasoning.py       Human-readable explanation generator
      pipeline.py        End-to-end: features → elasticity → optimize → recommend
      seed.py            Synthetic 90-day history for the demo SKUs

Why no scikit-learn / numpy:
  • OLS log-log elasticity has a closed-form solution. Implementing it
    in pure Python demonstrates you understand the math (not just the
    library API), which is a stronger signal in a pricing-engineer
    interview than `model.fit(X, y)`.
  • Keeps the deploy lightweight. Numpy + sklearn + scipy would add
    ~150 MB to the Render container for ~50 lines of math we can
    write directly.
  • For larger workloads (millions of SKUs) we'd swap in numpy
    vectorisation — the interface here is the production contract,
    the implementation is the demo-scale choice.
"""
from app.pricing.models import (
    ElasticityFit,
    HistoricalObservation,
    PricingFeatures,
    PricingRecommendation,
    PricingReason,
)
from app.pricing.pipeline import recommend_for_sku, run_pricing_engine

__all__ = [
    "ElasticityFit",
    "HistoricalObservation",
    "PricingFeatures",
    "PricingRecommendation",
    "PricingReason",
    "recommend_for_sku",
    "run_pricing_engine",
]

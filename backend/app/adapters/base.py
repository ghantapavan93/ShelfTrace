"""Mock channel adapters.

These simulate the three customer-facing price channels. In production each
would wrap a real integration (POS API, ESL/wireless gateway, ecommerce feed);
here they return structured, normalized receipts. What a channel "observes" is
supplied by the caller from the scenario's connector behavior profile — the
adapters contain no product-specific logic.

Interface mirrors a real adapter contract:
    publish_price_change()  -> ack
    build_verify_receipt()  -> normalized observed receipt (from resolved behavior)
    rollback_price_change() -> restore prior price
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.services.behavior import TIMEOUT
from app.ids import new_id


class AdapterReceipt(dict):
    """A normalized, source-preserving receipt from a channel."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChannelAdapter:
    channel: str = "base"
    system_name: str = "base-system"

    def publish_price_change(self, *, sku: str, store_id: str, approved_price: float) -> AdapterReceipt:
        return AdapterReceipt(
            adapter=self.system_name,
            channel=self.channel,
            store_id=store_id,
            sku=sku,
            action="publish",
            approved_price=approved_price,
            ack=True,
            correlation_id=new_id("corr"),
            timestamp=_now(),
        )

    def build_verify_receipt(
        self,
        *,
        sku: str,
        store_id: str,
        approved_price: float,
        observed,
        behavior_type: str = "success",
        duplicate_ack: bool = False,
        delay_ms: int | None = None,
    ) -> AdapterReceipt:
        """Build a normalized receipt from a resolved observation.

        ``observed`` is either a float price or the TIMEOUT marker. ``delay_ms``
        is the channel's acknowledgement latency from the behavior profile.
        """
        if observed == TIMEOUT:
            receipt = AdapterReceipt(
                adapter=self.system_name,
                channel=self.channel,
                store_id=store_id,
                sku=sku,
                action="verify",
                expected_price=approved_price,
                observed_price=None,
                ack=False,
                status="TIMEOUT",
                behavior=behavior_type,
                receipt_id=new_id("rcpt"),
                correlation_id=new_id("corr"),
                timestamp=_now(),
            )
        else:
            status = "VERIFIED" if abs(observed - approved_price) < 0.001 else "MISMATCH"
            receipt = AdapterReceipt(
                adapter=self.system_name,
                channel=self.channel,
                store_id=store_id,
                sku=sku,
                action="verify",
                expected_price=approved_price,
                observed_price=observed,
                ack=True,
                status=status,
                behavior=behavior_type,
                receipt_id=new_id("rcpt"),
                correlation_id=new_id("corr"),
                timestamp=_now(),
            )
            if duplicate_ack:
                receipt["duplicate_ack_received"] = True
                receipt["duplicate_ack_dropped"] = True
        if delay_ms is not None:
            receipt["ack_latency_ms"] = delay_ms
        return receipt

    def rollback_price_change(self, *, sku: str, store_id: str, prior_price: float) -> AdapterReceipt:
        return AdapterReceipt(
            adapter=self.system_name,
            channel=self.channel,
            store_id=store_id,
            sku=sku,
            action="rollback",
            restored_price=prior_price,
            ack=True,
            correlation_id=new_id("corr"),
            timestamp=_now(),
        )


class POSAdapter(ChannelAdapter):
    channel = "pos"
    system_name = "pos-register-gateway"


class ESLAdapter(ChannelAdapter):
    channel = "esl"
    system_name = "esl-wireless-gateway"


class EcommerceAdapter(ChannelAdapter):
    channel = "ecommerce"
    system_name = "ecommerce-feed"


ADAPTERS: dict[str, ChannelAdapter] = {
    "pos": POSAdapter(),
    "esl": ESLAdapter(),
    "ecommerce": EcommerceAdapter(),
}

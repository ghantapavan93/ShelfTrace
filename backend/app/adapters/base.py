"""Mock channel adapters.

These simulate the three customer-facing price channels. In production each
would wrap a real integration (POS API, ESL/wireless gateway, ecommerce feed);
here they return structured, normalized receipts driven by the demo scenario.

Interface mirrors a real adapter contract:
    publish_price_change() -> ack
    verify_current_price() -> observed receipt
    retry_update()         -> re-publish + re-verify
    rollback_price_change()-> restore prior price
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.adapters import scenario
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

    def verify_current_price(
        self, *, sku: str, store_id: str, approved_price: float, attempt: int
    ) -> AdapterReceipt:
        observed = scenario.observe(sku, store_id, self.channel, approved_price, attempt)
        if observed == scenario.TIMEOUT:
            return AdapterReceipt(
                adapter=self.system_name,
                channel=self.channel,
                store_id=store_id,
                sku=sku,
                action="verify",
                expected_price=approved_price,
                observed_price=None,
                ack=False,
                status="TIMEOUT",
                receipt_id=new_id("rcpt"),
                correlation_id=new_id("corr"),
                timestamp=_now(),
            )
        status = "VERIFIED" if abs(observed - approved_price) < 0.001 else "MISMATCH"
        return AdapterReceipt(
            adapter=self.system_name,
            channel=self.channel,
            store_id=store_id,
            sku=sku,
            action="verify",
            expected_price=approved_price,
            observed_price=observed,
            ack=True,
            status=status,
            receipt_id=new_id("rcpt"),
            correlation_id=new_id("corr"),
            timestamp=_now(),
        )

    def retry_update(self, *, sku: str, store_id: str, approved_price: float, attempt: int) -> AdapterReceipt:
        self.publish_price_change(sku=sku, store_id=store_id, approved_price=approved_price)
        return self.verify_current_price(
            sku=sku, store_id=store_id, approved_price=approved_price, attempt=attempt
        )

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

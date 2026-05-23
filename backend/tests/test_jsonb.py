"""JSONB roundtrip — callers store and read dicts; SQLAlchemy handles the rest."""
from __future__ import annotations

from app.models import OutboxEvent, OutboxStatus


def test_outbox_payload_roundtrip_as_dict(db):
    """payload_json is a dict on read (no manual json.loads). On Postgres the
    column is JSONB and indexable; on SQLite it's JSON (TEXT under the hood).
    Either way, callers work with native dicts."""
    event = OutboxEvent(
        id="evt_jsonb_rt",
        event_type="RECONCILE_REQUESTED",
        aggregate_id="act_x",
        payload_json={"action_id": "act_x", "batch_id": "b_1", "meta": {"k": [1, 2]}},
        status=OutboxStatus.PENDING,
    )
    db.add(event)
    db.commit()
    db.expire_all()

    reread = db.get(OutboxEvent, "evt_jsonb_rt")
    assert isinstance(reread.payload_json, dict)
    assert reread.payload_json["action_id"] == "act_x"
    assert reread.payload_json["meta"]["k"] == [1, 2]

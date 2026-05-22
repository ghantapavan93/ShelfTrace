from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import AuditEvent


def record_audit(
    db: Session,
    *,
    event: str,
    detail: str,
    actor: str = "system",
    batch_id: str | None = None,
    incident_id: str | None = None,
    action_id: str | None = None,
    created_at: datetime | None = None,
) -> AuditEvent:
    """Persist an audit event. ``created_at`` may be supplied explicitly so the
    caller can guarantee strictly increasing timestamps for a causal sequence
    (the model default uses utcnow at row creation otherwise)."""
    ev = AuditEvent(
        id=new_id("audit"),
        batch_id=batch_id,
        incident_id=incident_id,
        action_id=action_id,
        event=event,
        detail=detail,
        actor=actor,
    )
    if created_at is not None:
        ev.created_at = created_at
    db.add(ev)
    return ev

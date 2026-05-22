from __future__ import annotations

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
) -> AuditEvent:
    ev = AuditEvent(
        id=new_id("audit"),
        batch_id=batch_id,
        incident_id=incident_id,
        action_id=action_id,
        event=event,
        detail=detail,
        actor=actor,
    )
    db.add(ev)
    return ev

"""SSE streaming bulk-import endpoint.

Verifies the streaming contract:
  • event order: meta first, done last
  • one 'row' event per parsed row
  • payload errors emitted as 'error' events
  • duplicate-SKU detection works inline (not after the fact)
  • the synchronous /import/preview still returns the same shape
"""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app
from app.services import bulk_import


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    """Parse SSE-framed text into [(event_type, payload_dict), ...]."""
    events: list[tuple[str, dict]] = []
    for chunk in body.split("\n\n"):
        if not chunk.strip():
            continue
        event_type = None
        data_str = None
        for line in chunk.split("\n"):
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
        if event_type and data_str is not None:
            events.append((event_type, json.loads(data_str)))
    return events


def test_stream_preview_yields_meta_first_done_last(db):
    """Every stream begins with 'meta' and ends with 'done', no exceptions."""
    events = list(
        bulk_import.stream_preview(
            "csv",
            "sku,product_name,prior_price,approved_price\nE1,Eggs,3.99,4.19\n",
        ),
    )
    assert len(events) >= 3, f"expected at least meta+row+done, got {events}"
    assert events[0][0] == "meta", f"first event should be 'meta', got {events[0]}"
    assert events[-1][0] == "done", f"last event should be 'done', got {events[-1]}"


def test_stream_preview_one_row_event_per_data_row():
    """Three data rows → three 'row' events."""
    content = (
        "sku,product_name,prior_price,approved_price\n"
        "E1,Eggs,3.99,4.19\n"
        "M1,Milk,5.49,5.99\n"
        "B1,Bread,2.99,3.49\n"
    )
    events = list(bulk_import.stream_preview("csv", content))
    row_events = [e for e in events if e[0] == "row"]
    assert len(row_events) == 3
    # Each row event includes the full validated payload
    for _, payload in row_events:
        assert "row_number" in payload
        assert "valid" in payload
        assert "sku" in payload


def test_stream_preview_empty_payload_emits_error_event():
    events = list(bulk_import.stream_preview("csv", ""))
    error_events = [e for e in events if e[0] == "error"]
    assert any("empty" in e[1]["message"].lower() for e in error_events)
    # Even on error, 'done' still fires so the client can finalize the UI
    assert events[-1][0] == "done"


def test_stream_preview_oversized_payload_emits_error_event():
    big = "sku,product_name,prior_price,approved_price\n" + (
        "X,Y,1,1\n" * 200_000
    )
    events = list(bulk_import.stream_preview("csv", big))
    error_events = [e for e in events if e[0] == "error"]
    assert any("exceeds" in e[1]["message"].lower() for e in error_events)


def test_stream_preview_row_cap_error_precedes_rows():
    """Regression: the MAX_ROWS cap warning must be emitted BEFORE the row
    events, not buffered until after the last row.

    A payload over the row cap but under the byte cap exercises the in-loop
    cap path (distinct from the early-return byte-cap path). The warning is
    known the moment the iterator starts, so a progressive UI must see it up
    front — otherwise the user watches 5,000 clean rows scroll past before
    learning the file was truncated.
    """
    # ~6000 short rows: over MAX_ROWS (5000), well under MAX_BYTES (1 MiB).
    content = "sku,product_name,prior_price,approved_price\n" + ("X,Y,1,1\n" * 6000)
    events = list(bulk_import.stream_preview("csv", content))
    kinds = [e[0] for e in events]

    cap_idx = next(
        i for i, e in enumerate(events)
        if e[0] == "error" and "cap" in e[1]["message"].lower()
    )
    first_row_idx = kinds.index("row")
    # The cap warning lands before the first row event (and after 'meta').
    assert cap_idx < first_row_idx
    assert kinds[0] == "meta"
    assert kinds[-1] == "done"
    # And the payload was actually truncated to the cap.
    assert events[-1][1]["total"] == 5000


def test_stream_preview_duplicate_skus_marked_invalid_inline():
    """Second occurrence of a SKU is flagged invalid WITHIN its row event —
    not in a separate after-the-fact pass. This matters for streaming UX:
    the row shouldn't flicker from valid → invalid as later events arrive.
    """
    content = (
        "sku,product_name,prior_price,approved_price\n"
        "EGG,Eggs A,3.99,4.19\n"
        "EGG,Eggs B,3.99,4.29\n"
    )
    events = list(bulk_import.stream_preview("csv", content))
    row_events = [e[1] for e in events if e[0] == "row"]
    assert len(row_events) == 2
    # First occurrence stays valid; second is marked invalid
    assert row_events[0]["valid"] is True
    assert row_events[1]["valid"] is False
    assert any("duplicate sku" in err for err in row_events[1]["errors"])


def test_synchronous_preview_still_works_after_refactor():
    """The existing /import/preview endpoint is implemented via the stream
    generator. This test pins that the synchronous contract is unchanged."""
    result = bulk_import.preview(
        "csv",
        "sku,product_name,prior_price,approved_price\nE1,Eggs,3.99,4.19\n",
    )
    assert len(result.rows) == 1
    assert result.rows[0].sku == "E1"
    assert result.rows[0].valid is True
    assert result.summary["valid"] == 1
    assert result.source_sha256  # populated from the meta event


def test_sse_endpoint_emits_correct_event_sequence(db):
    """Full HTTP integration: POST to the SSE endpoint, parse the wire
    format, verify the event sequence the frontend will consume."""
    client = TestClient(app)
    res = client.post(
        "/api/v1/scenarios/import/preview/stream",
        json={
            "format": "csv",
            "content": (
                "sku,product_name,prior_price,approved_price\n"
                "E1,Eggs,3.99,4.19\n"
                "M1,Milk,5.49,5.99\n"
            ),
        },
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"].startswith("no-cache")

    events = _parse_sse(res.text)
    assert events[0][0] == "meta"
    assert events[0][1]["format"] == "csv"
    assert events[0][1]["schema_version"] == bulk_import.IMPORT_SCHEMA_VERSION

    row_events = [e for e in events if e[0] == "row"]
    assert len(row_events) == 2
    assert row_events[0][1]["sku"] == "E1"
    assert row_events[1][1]["sku"] == "M1"

    done = [e for e in events if e[0] == "done"]
    assert len(done) == 1
    assert done[0][1]["total"] == 2
    assert done[0][1]["valid"] == 2
    assert done[0][1]["invalid"] == 0


def test_sse_endpoint_rejects_unknown_format():
    client = TestClient(app)
    res = client.post(
        "/api/v1/scenarios/import/preview/stream",
        json={"format": "xml", "content": ""},
    )
    assert res.status_code == 422

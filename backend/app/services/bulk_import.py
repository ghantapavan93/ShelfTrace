"""Bulk-import parser for Scenario products.

Server-authoritative parsing + validation for CSV / TSV / JSON payloads
posted to /api/v1/scenarios/import/preview. Mirrors the client-side
parser but is the source of truth — the client preview is a UX nicety,
this is the contract.

Design choices:
  • Pure functions. No DB. The endpoint stays a stateless validator.
  • Returns *every* row with a per-row status, so the UI can render a
    full per-row diff (✓ valid / ✗ invalid + why) instead of "row 17
    failed."
  • RFC-4180-ish CSV: respects double-quoted fields with embedded commas
    and escaped quotes. Doesn't try to handle every Excel edge case
    (newlines inside quoted fields) — the explicit JSON format is the
    escape hatch for that.
  • Hard size cap (1 MiB content) so a paste-bomb doesn't OOM the box.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from dataclasses import asdict, dataclass, field
from typing import Any, Iterator, Literal

MAX_BYTES = 1_048_576  # 1 MiB — generous for a paste/upload preview
MAX_ROWS = 5_000  # hard cap on rows to keep the round-trip snappy
IMPORT_SCHEMA_VERSION = "bulk-import-v1"

# ──────────────────────────────────────────────────────────────────────
# Streaming protocol — yielded by stream_preview() for SSE endpoint
# ──────────────────────────────────────────────────────────────────────

# Each event is a (type, payload) tuple. The SSE wrapper translates these
# into `event: <type>\ndata: <json(payload)>\n\n` text frames. Consumers
# (the frontend EventSource client, tests) read events in this order:
#
#   meta    once   {format, source_sha256, schema_version}
#   error   0..n   {message}                  (payload-level errors)
#   row     0..n   {row_number, valid, ...}   (per-row validation)
#   done    once   {total, valid, invalid, blank_rows_skipped}
#
# The 'meta' and 'done' events MUST always fire so the client can pin
# its lifecycle (loading → processing → finished). 'error' events do not
# imply the stream terminates — payload validation errors emit alongside
# 'row' events for partial visibility.

StreamEvent = tuple[str, dict[str, Any]]

ImportFormat = Literal["csv", "tsv", "json"]

REQUIRED_COLUMNS = ("sku", "product_name", "prior_price", "approved_price")
OPTIONAL_COLUMNS = ("reason", "is_kvi", "deadline_at")


@dataclass
class ImportRow:
    row_number: int  # 1-indexed including header
    valid: bool
    errors: list[str] = field(default_factory=list)
    sku: str = ""
    product_name: str = ""
    previous_price: float = 0.0
    approved_price: float = 0.0
    reason: str = "Bulk imported"
    is_kvi: bool = False
    deadline_at: str | None = None


@dataclass
class ImportPreview:
    format: ImportFormat
    rows: list[ImportRow]
    summary: dict[str, int]
    payload_errors: list[str] = field(default_factory=list)
    blank_rows_skipped: int = 0  # count of fully-empty rows quietly dropped
    source_sha256: str = ""
    schema_version: str = IMPORT_SCHEMA_VERSION


# ──────────────────────────────────────────────────────────────────────
# Entrypoint — synchronous (existing contract)
# ──────────────────────────────────────────────────────────────────────
def preview(format_: ImportFormat, content: str) -> ImportPreview:
    """Parse `content` as `format_` and return a per-row preview.

    Implemented in terms of `stream_preview()` so the streaming path and
    the synchronous path share one validator. Difference is purely
    delivery shape (collected vs streamed).
    """
    rows: list[ImportRow] = []
    payload_errors: list[str] = []
    source_sha256 = ""
    blank_rows_skipped = 0
    for kind, payload in stream_preview(format_, content):
        if kind == "meta":
            source_sha256 = payload.get("source_sha256", "")
        elif kind == "error":
            payload_errors.append(payload.get("message", ""))
        elif kind == "row":
            rows.append(_row_from_dict(payload))
        elif kind == "done":
            blank_rows_skipped = payload.get("blank_rows_skipped", 0)
    return ImportPreview(
        format_,
        rows,
        _summary(rows, len(rows)),
        payload_errors,
        blank_rows_skipped=blank_rows_skipped,
        source_sha256=source_sha256,
    )


def _row_from_dict(d: dict[str, Any]) -> ImportRow:
    """Reverse of asdict(ImportRow) — used by preview() to reconstruct."""
    return ImportRow(
        row_number=d.get("row_number", 0),
        valid=d.get("valid", False),
        errors=list(d.get("errors", [])),
        sku=d.get("sku", ""),
        product_name=d.get("product_name", ""),
        previous_price=d.get("previous_price", 0.0),
        approved_price=d.get("approved_price", 0.0),
        reason=d.get("reason", "Bulk imported"),
        is_kvi=d.get("is_kvi", False),
        deadline_at=d.get("deadline_at"),
    )


# ──────────────────────────────────────────────────────────────────────
# Streaming entrypoint — yields events as it processes
# ──────────────────────────────────────────────────────────────────────
def stream_preview(format_: ImportFormat, content: str) -> Iterator[StreamEvent]:
    """Stream validation events as the payload is parsed row-by-row.

    Always yields exactly one 'meta' event first and one 'done' event
    last. Between them, 0..n 'row' events (one per parsed row) and 0..n
    'error' events (payload-level problems — empty input, oversized,
    invalid JSON shape).

    Cross-row checks like duplicate-SKU detection run online: each row
    is compared against the set of SKUs already yielded so the second
    occurrence is marked invalid before the event fires. This keeps the
    streaming experience honest — no "this row looked valid but actually
    wasn't" updates after the fact.
    """
    source_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
    yield ("meta", {
        "format": format_,
        "source_sha256": source_sha256,
        "schema_version": IMPORT_SCHEMA_VERSION,
    })

    if not content or not content.strip():
        yield ("error", {"message": "Payload is empty."})
        yield ("done", {
            "total": 0, "valid": 0, "invalid": 0, "blank_rows_skipped": 0,
        })
        return

    if len(content.encode("utf-8")) > MAX_BYTES:
        yield ("error", {
            "message": (
                f"Payload exceeds {MAX_BYTES // 1024} KiB. "
                "Split into smaller files or remove unused columns."
            ),
        })
        yield ("done", {
            "total": 0, "valid": 0, "invalid": 0, "blank_rows_skipped": 0,
        })
        return

    # Cross-row state tracked incrementally so duplicate-SKU rows are
    # caught and emitted invalid in-band, not after a buffer pass.
    seen_skus: set[str] = set()
    valid_count = 0
    invalid_count = 0
    total = 0
    blank_skipped = 0

    def _emit_row(row: ImportRow) -> StreamEvent:
        nonlocal valid_count, invalid_count, total
        if row.sku:
            if row.sku in seen_skus:
                row.valid = False
                row.errors.append(
                    f"duplicate sku — '{row.sku}' already appeared in this payload; "
                    "remove or rename one of the duplicates",
                )
            else:
                seen_skus.add(row.sku)
        total += 1
        if row.valid:
            valid_count += 1
        else:
            invalid_count += 1
        return ("row", asdict(row))

    payload_errors_buffer: list[str] = []
    emitted_errors = 0

    def _drain_errors() -> Iterator[StreamEvent]:
        """Emit payload-level errors appended since the last drain.

        Payload errors (oversize cap, malformed JSON shape) are appended to
        the buffer by the row iterators — typically up-front, before the
        first row is yielded. Draining BEFORE each row event keeps the SSE
        stream faithful to its documented order (errors surface as soon as
        they're known, interleaved with rows) instead of dumping them all
        after the last row, where a progressive UI would only learn of a
        truncation warning once the whole payload had scrolled past.
        """
        nonlocal emitted_errors
        while emitted_errors < len(payload_errors_buffer):
            msg = payload_errors_buffer[emitted_errors]
            emitted_errors += 1
            yield ("error", {"message": msg})

    try:
        if format_ == "json":
            for row in _iter_json_rows(content, payload_errors_buffer):
                yield from _drain_errors()
                yield _emit_row(row)
        elif format_ == "tsv":
            for row, blank_inc in _iter_delimited_rows(content, "\t", payload_errors_buffer):
                yield from _drain_errors()
                blank_skipped += blank_inc
                if row is not None:
                    yield _emit_row(row)
        else:
            for row, blank_inc in _iter_delimited_rows(content, ",", payload_errors_buffer):
                yield from _drain_errors()
                blank_skipped += blank_inc
                if row is not None:
                    yield _emit_row(row)
    except Exception as exc:  # pragma: no cover — defensive
        yield ("error", {"message": f"Unexpected parse failure: {exc}"})

    # Flush any errors appended during/after the final row (cap hit on the
    # last batch, or errors from an iterator that yielded no rows at all).
    yield from _drain_errors()

    yield ("done", {
        "total": total,
        "valid": valid_count,
        "invalid": invalid_count,
        "blank_rows_skipped": blank_skipped,
    })


def _mark_duplicate_skus(rows: list[ImportRow]) -> None:
    """Cross-row check: if the same non-empty SKU appears more than once,
    mark every duplicate occurrence as invalid. The first occurrence stays
    valid (so the user can still apply the canonical row). Without this,
    two rows with the same SKU would create an ambiguous batch — second
    write wins, silently."""
    seen: dict[str, int] = {}
    for row in rows:
        if not row.sku:
            continue
        prev_count = seen.get(row.sku, 0)
        if prev_count >= 1:
            row.valid = False
            row.errors.append(
                f"duplicate sku — '{row.sku}' already appeared in this payload; "
                "remove or rename one of the duplicates",
            )
        seen[row.sku] = prev_count + 1


def _summary(rows: list[ImportRow], total: int) -> dict[str, int]:
    valid = sum(1 for r in rows if r.valid)
    return {
        "total": total,
        "valid": valid,
        "invalid": total - valid,
    }


# ──────────────────────────────────────────────────────────────────────
# JSON path — streaming iterator
# ──────────────────────────────────────────────────────────────────────
def _iter_json_rows(content: str, payload_errors: list[str]) -> Iterator[ImportRow]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        payload_errors.append(f"Invalid JSON: {exc.msg} (line {exc.lineno})")
        return

    if not isinstance(data, list):
        payload_errors.append(
            "JSON payload must be an array of objects, e.g. "
            '[{"sku": "...", "product_name": "...", "prior_price": 1, "approved_price": 1}].',
        )
        return

    if len(data) > MAX_ROWS:
        payload_errors.append(
            f"Payload has {len(data)} rows; cap is {MAX_ROWS}.",
        )
        data = data[:MAX_ROWS]

    for i, raw in enumerate(data, start=1):
        if not isinstance(raw, dict):
            yield ImportRow(
                row_number=i,
                valid=False,
                errors=[f"Expected an object, got {type(raw).__name__}."],
            )
            continue
        yield _validate_row(i, raw)


# ──────────────────────────────────────────────────────────────────────
# Delimited (CSV / TSV) path — streaming iterator
# ──────────────────────────────────────────────────────────────────────
def _iter_delimited_rows(
    content: str,
    delimiter: str,
    payload_errors: list[str],
) -> Iterator[tuple[ImportRow | None, int]]:
    """Yields (row, blank_increment) tuples. `row` is None when the slot
    was a blank row that should only bump the skipped counter.

    Delimited parsing is split out as an iterator so the streaming
    endpoint can emit one SSE 'row' event per parsed line instead of
    buffering the whole payload first.
    """
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    try:
        all_rows = list(reader)
    except csv.Error as exc:
        payload_errors.append(f"CSV parse error: {exc}")
        return

    if not all_rows:
        payload_errors.append("No rows found.")
        return

    # Header detection: looks for "sku" or "product_name" or "price" in row 0.
    header_candidates = [c.strip().lower() for c in all_rows[0]]
    has_header = any(
        any(token in c for token in ("sku", "product", "price", "reason"))
        for c in header_candidates
    )

    if has_header:
        headers = [_normalize_header(c) for c in header_candidates]
        data_rows = all_rows[1:]
    else:
        headers = list(REQUIRED_COLUMNS + OPTIONAL_COLUMNS)[: max(len(all_rows[0]), 4)]
        data_rows = all_rows

    if len(data_rows) > MAX_ROWS:
        payload_errors.append(
            f"Payload has {len(data_rows)} rows; cap is {MAX_ROWS}.",
        )
        data_rows = data_rows[:MAX_ROWS]

    base_offset = 2 if has_header else 1  # 1-indexed; row 1 is header if present
    for offset, raw in enumerate(data_rows):
        row_no = base_offset + offset - (1 if has_header else 0)
        if not raw or all(not (c or "").strip() for c in raw):
            # Blank rows are not errors — track them in the summary.
            yield (None, 1)
            continue
        record = _zip_record(headers, raw)
        yield (_validate_row(row_no, record), 0)


def _normalize_header(header: str) -> str:
    """`Prior Price ($)` → `prior_price` style normalization."""
    cleaned = "".join(c.lower() if c.isalnum() else "_" for c in header.strip())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    cleaned = cleaned.strip("_")
    aliases = {
        "previous_price": "prior_price",
        "old_price": "prior_price",
        "from_price": "prior_price",
        "new_price": "approved_price",
        "to_price": "approved_price",
        "target_price": "approved_price",
        "name": "product_name",
        "product": "product_name",
        "item": "product_name",
        "id": "sku",
        "item_id": "sku",
    }
    return aliases.get(cleaned, cleaned)


def _zip_record(headers: list[str], values: list[str]) -> dict[str, str]:
    record: dict[str, str] = {}
    for i, h in enumerate(headers):
        if i < len(values):
            record[h] = (values[i] or "").strip()
    return record


# ──────────────────────────────────────────────────────────────────────
# Per-row validation
# ──────────────────────────────────────────────────────────────────────
def _validate_row(row_no: int, record: dict[str, Any]) -> ImportRow:
    errors: list[str] = []

    sku = str(record.get("sku") or "").strip()
    if not sku:
        errors.append("sku is required")
    elif len(sku) > 128:
        errors.append("sku must be ≤ 128 chars")

    name = str(record.get("product_name") or "").strip()
    if not name:
        errors.append("product_name is required")
    elif len(name) > 256:
        errors.append("product_name must be ≤ 256 chars")

    prior = _to_float(record.get("prior_price"), "prior_price", errors)
    approved = _to_float(record.get("approved_price"), "approved_price", errors)

    if prior is not None and prior < 0:
        errors.append("prior_price must be ≥ 0")
    if approved is not None and approved <= 0:
        # Matches scenario runtime validation (approved must be strictly > 0).
        # Catching here avoids a confusing crash at Run time.
        errors.append("approved_price must be > 0")
    if prior is not None and approved is not None and approved > prior * 5:
        errors.append(
            f"approved_price ({approved}) is more than 5× prior_price ({prior}); "
            "looks like a typo",
        )

    reason = str(record.get("reason") or "").strip() or "Bulk imported"
    if len(reason) > 256:
        errors.append("reason must be ≤ 256 chars")

    is_kvi_raw = record.get("is_kvi")
    is_kvi = _to_bool(is_kvi_raw) if is_kvi_raw not in (None, "") else False

    deadline = record.get("deadline_at")
    deadline_at = str(deadline).strip() if deadline else None

    return ImportRow(
        row_number=row_no,
        valid=not errors,
        errors=errors,
        sku=sku,
        product_name=name,
        previous_price=prior or 0.0,
        approved_price=approved or 0.0,
        reason=reason,
        is_kvi=is_kvi,
        deadline_at=deadline_at,
    )


def _to_float(value: Any, field_name: str, errors: list[str]) -> float | None:
    if value is None or value == "":
        errors.append(f"{field_name} is required")
        return None
    if isinstance(value, bool):
        # `bool` is a subclass of `int` in Python; reject explicitly.
        errors.append(f"{field_name} must be a number")
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip().replace("$", "").replace(",", ""))
    except (ValueError, TypeError):
        errors.append(f"{field_name} must be a number (got {value!r})")
        return None


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    s = str(value).strip().lower()
    return s in ("true", "1", "yes", "y", "kvi")

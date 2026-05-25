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
import io
import json
from dataclasses import dataclass, field
from typing import Any, Literal

MAX_BYTES = 1_048_576  # 1 MiB — generous for a paste/upload preview
MAX_ROWS = 5_000  # hard cap on rows to keep the round-trip snappy

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


# ──────────────────────────────────────────────────────────────────────
# Entrypoint
# ──────────────────────────────────────────────────────────────────────
def preview(format_: ImportFormat, content: str) -> ImportPreview:
    """Parse `content` as `format_` and return a per-row preview."""
    payload_errors: list[str] = []

    if not content or not content.strip():
        payload_errors.append("Payload is empty.")
        return ImportPreview(format_, [], _summary([], 0), payload_errors)

    if len(content.encode("utf-8")) > MAX_BYTES:
        payload_errors.append(
            f"Payload exceeds {MAX_BYTES // 1024} KiB. "
            "Split into smaller files or remove unused columns.",
        )
        return ImportPreview(format_, [], _summary([], 0), payload_errors)

    if format_ == "json":
        rows = _parse_json(content, payload_errors)
    elif format_ == "tsv":
        rows = _parse_delimited(content, "\t", payload_errors)
    else:
        rows = _parse_delimited(content, ",", payload_errors)

    return ImportPreview(format_, rows, _summary(rows, len(rows)), payload_errors)


def _summary(rows: list[ImportRow], total: int) -> dict[str, int]:
    valid = sum(1 for r in rows if r.valid)
    return {
        "total": total,
        "valid": valid,
        "invalid": total - valid,
    }


# ──────────────────────────────────────────────────────────────────────
# JSON path
# ──────────────────────────────────────────────────────────────────────
def _parse_json(content: str, payload_errors: list[str]) -> list[ImportRow]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        payload_errors.append(f"Invalid JSON: {exc.msg} (line {exc.lineno})")
        return []

    if not isinstance(data, list):
        payload_errors.append(
            "JSON payload must be an array of objects, e.g. "
            '[{"sku": "...", "product_name": "...", "prior_price": 1, "approved_price": 1}].',
        )
        return []

    if len(data) > MAX_ROWS:
        payload_errors.append(
            f"Payload has {len(data)} rows; cap is {MAX_ROWS}.",
        )
        data = data[:MAX_ROWS]

    rows: list[ImportRow] = []
    for i, raw in enumerate(data, start=1):
        if not isinstance(raw, dict):
            rows.append(
                ImportRow(
                    row_number=i,
                    valid=False,
                    errors=[f"Expected an object, got {type(raw).__name__}."],
                ),
            )
            continue
        rows.append(_validate_row(i, raw))
    return rows


# ──────────────────────────────────────────────────────────────────────
# Delimited (CSV / TSV) path
# ──────────────────────────────────────────────────────────────────────
def _parse_delimited(
    content: str,
    delimiter: str,
    payload_errors: list[str],
) -> list[ImportRow]:
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    try:
        all_rows = list(reader)
    except csv.Error as exc:
        payload_errors.append(f"CSV parse error: {exc}")
        return []

    if not all_rows:
        payload_errors.append("No rows found.")
        return []

    # Header detection: looks for "sku" or "product_name" or "price" in row 0.
    header_candidates = [c.strip().lower() for c in all_rows[0]]
    has_header = any(
        any(token in c for token in ("sku", "product", "price", "reason"))
        for c in header_candidates
    )

    if has_header:
        headers = [
            _normalize_header(c) for c in header_candidates
        ]
        data_rows = all_rows[1:]
    else:
        headers = list(REQUIRED_COLUMNS + OPTIONAL_COLUMNS)[: max(len(all_rows[0]), 4)]
        data_rows = all_rows

    if len(data_rows) > MAX_ROWS:
        payload_errors.append(
            f"Payload has {len(data_rows)} rows; cap is {MAX_ROWS}.",
        )
        data_rows = data_rows[:MAX_ROWS]

    rows: list[ImportRow] = []
    base_offset = 2 if has_header else 1  # 1-indexed; row 1 is header if present
    for offset, raw in enumerate(data_rows):
        row_no = base_offset + offset - (1 if has_header else 0)
        if not raw or all(not (c or "").strip() for c in raw):
            # Skip empty lines silently
            continue
        record = _zip_record(headers, raw)
        rows.append(_validate_row(row_no, record))
    return rows


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
    if approved is not None and approved < 0:
        errors.append("approved_price must be ≥ 0")
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

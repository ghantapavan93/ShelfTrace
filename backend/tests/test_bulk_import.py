"""Tests for the bulk import parser (services/bulk_import.py).

Covers CSV / TSV / JSON parsing, header detection, alias mapping, the
sanity check that flags suspicious price multiples, and the size cap.
The endpoint sits on top of these so endpoint behaviour is also pinned.
"""
from __future__ import annotations

from app.services import bulk_import


# ──────────────────────────────────────────────────────────────────────
# Happy paths
# ──────────────────────────────────────────────────────────────────────
def test_csv_with_header_parses_all_rows():
    csv = """sku,product_name,prior_price,approved_price,reason
milk-1gal,Whole Milk 1 Gal,5.99,4.99,Memorial Day
eggs-12,Cage-Free Eggs Dozen,4.19,3.49,KVI
"""
    result = bulk_import.preview("csv", csv)
    assert result.summary == {"total": 2, "valid": 2, "invalid": 0}
    assert result.payload_errors == []
    assert [r.sku for r in result.rows] == ["milk-1gal", "eggs-12"]
    assert result.rows[0].previous_price == 5.99
    assert result.rows[0].approved_price == 4.99
    assert result.rows[1].reason == "KVI"


def test_csv_without_header_uses_positional_defaults():
    csv = "milk-1gal,Whole Milk 1 Gal,5.99,4.99\n"
    result = bulk_import.preview("csv", csv)
    assert result.summary["valid"] == 1
    row = result.rows[0]
    assert row.sku == "milk-1gal"
    assert row.previous_price == 5.99
    assert row.approved_price == 4.99


def test_tsv_with_header_parses():
    tsv = "sku\tproduct_name\tprior_price\tapproved_price\nmilk\tMilk\t5.99\t4.99\n"
    result = bulk_import.preview("tsv", tsv)
    assert result.summary == {"total": 1, "valid": 1, "invalid": 0}
    assert result.rows[0].sku == "milk"


def test_json_array_of_objects_parses():
    payload = """[
        {"sku":"milk-1gal","product_name":"Milk","prior_price":5.99,"approved_price":4.99},
        {"sku":"eggs-12","product_name":"Eggs","prior_price":4.19,"approved_price":3.49,"reason":"KVI"}
    ]"""
    result = bulk_import.preview("json", payload)
    assert result.summary == {"total": 2, "valid": 2, "invalid": 0}
    assert result.rows[1].reason == "KVI"


# ──────────────────────────────────────────────────────────────────────
# Per-row validation
# ──────────────────────────────────────────────────────────────────────
def test_missing_required_field_marks_row_invalid_with_explanation():
    csv = "sku,product_name,prior_price,approved_price\n,Milk,5.99,4.99\n"
    result = bulk_import.preview("csv", csv)
    assert result.summary == {"total": 1, "valid": 0, "invalid": 1}
    assert "sku is required" in result.rows[0].errors


def test_non_numeric_price_flags_row():
    csv = "sku,product_name,prior_price,approved_price\nm,Milk,abc,4.99\n"
    result = bulk_import.preview("csv", csv)
    assert result.summary["invalid"] == 1
    msg = " ".join(result.rows[0].errors)
    assert "prior_price" in msg and "number" in msg


def test_price_with_currency_and_comma_is_accepted():
    # Real-world spreadsheet exports often have "$1,299.99"
    csv = "sku,product_name,prior_price,approved_price\nm,Milk,\"$1,299.99\",\"$999.99\"\n"
    result = bulk_import.preview("csv", csv)
    assert result.summary["valid"] == 1
    assert result.rows[0].previous_price == 1299.99
    assert result.rows[0].approved_price == 999.99


def test_typo_protection_flags_5x_price_jump():
    # 5.99 → 599 is almost certainly a missing decimal point, not a real markup.
    csv = "sku,product_name,prior_price,approved_price\nm,Milk,5.99,599\n"
    result = bulk_import.preview("csv", csv)
    assert result.summary["invalid"] == 1
    assert any("5×" in e or "5x" in e for e in result.rows[0].errors)


# ──────────────────────────────────────────────────────────────────────
# Header normalisation + aliases
# ──────────────────────────────────────────────────────────────────────
def test_header_aliases_old_to_new_naming():
    # Real-world spreadsheets often use "Item ID" / "Old Price" / "New Price"
    csv = (
        "Item ID,Product,Old Price,New Price\n"
        "milk-1gal,Whole Milk,5.99,4.99\n"
    )
    result = bulk_import.preview("csv", csv)
    assert result.summary == {"total": 1, "valid": 1, "invalid": 0}
    row = result.rows[0]
    assert row.sku == "milk-1gal"
    assert row.product_name == "Whole Milk"
    assert row.previous_price == 5.99
    assert row.approved_price == 4.99


def test_blank_lines_are_skipped_silently():
    csv = """sku,product_name,prior_price,approved_price
milk,Milk,5.99,4.99


eggs,Eggs,4.19,3.49
"""
    result = bulk_import.preview("csv", csv)
    assert result.summary == {"total": 2, "valid": 2, "invalid": 0}


# ──────────────────────────────────────────────────────────────────────
# Payload-level errors
# ──────────────────────────────────────────────────────────────────────
def test_empty_payload_returns_payload_error():
    result = bulk_import.preview("csv", "")
    assert result.summary == {"total": 0, "valid": 0, "invalid": 0}
    assert any("empty" in e.lower() for e in result.payload_errors)


def test_size_cap_rejects_oversized_payload():
    huge = "x" * (bulk_import.MAX_BYTES + 1)
    result = bulk_import.preview("csv", huge)
    assert result.rows == []
    assert any("exceeds" in e.lower() for e in result.payload_errors)


def test_invalid_json_returns_clear_error():
    result = bulk_import.preview("json", "{not valid json")
    assert result.rows == []
    assert any("invalid json" in e.lower() for e in result.payload_errors)


def test_json_payload_must_be_an_array():
    result = bulk_import.preview("json", '{"sku": "x"}')
    assert result.rows == []
    assert any("array of objects" in e.lower() for e in result.payload_errors)

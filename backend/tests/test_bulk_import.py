"""Tests for the bulk import parser (services/bulk_import.py).

Covers CSV / TSV / JSON parsing, header detection, alias mapping, the
sanity check that flags suspicious price multiples, and the size cap.
The endpoint sits on top of these so endpoint behaviour is also pinned.
"""
from __future__ import annotations

import hashlib

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


def test_preview_returns_source_hash_and_schema_version():
    csv = "sku,product_name,prior_price,approved_price\nmilk,Milk,5.99,4.99\n"
    result = bulk_import.preview("csv", csv)
    assert result.source_sha256 == hashlib.sha256(csv.encode("utf-8")).hexdigest()
    assert result.schema_version == "bulk-import-v1"


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


# ──────────────────────────────────────────────────────────────────────
# Preview must catch what runtime catches — caught at the wrong layer
# is worse than not caught at all, because reviewers think the row is fine
# and then crash on Run.
# ──────────────────────────────────────────────────────────────────────
def test_zero_approved_price_is_invalid_at_preview():
    """approved_price = 0 must fail preview, not pass and crash later at Run.
    Mirrors validate_scenario in services/scenarios.py which requires > 0."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "zero-test,Zero Price Item,1.99,0\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["invalid"] == 1
    row = result.rows[0]
    assert row.valid is False
    assert any("approved_price must be > 0" in e for e in row.errors)


def test_negative_approved_price_is_invalid():
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "neg-test,Negative Price,2.99,-1.00\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["invalid"] == 1
    assert any("approved_price must be > 0" in e for e in result.rows[0].errors)


def test_negative_prior_price_is_invalid():
    """prior_price < 0 must fail preview. Mirrors validate_scenario which
    requires previous_price >= 0; pinned so a refactor can't weaken it."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "neg-prior,Negative Prior,-2.99,4.99\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["invalid"] == 1
    row = result.rows[0]
    assert row.valid is False
    assert any("prior_price must be ≥ 0" in e for e in row.errors)


def test_missing_approved_price_is_required():
    """An empty approved_price cell is a required-field error, not a silent 0."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "no-approved,Missing Approved,5.99,\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["invalid"] == 1
    row = result.rows[0]
    assert row.valid is False
    assert any("approved_price is required" in e for e in row.errors)


def test_duplicate_sku_marks_second_row_invalid():
    """Two rows with the same SKU would create an ambiguous batch.
    The first stays valid, the second is flagged so the user knows to fix it."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "milk-1gal,Original Milk,6.49,5.99\n"
        "milk-1gal,Duplicate Milk,6.49,5.99\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["total"] == 2
    assert result.summary["valid"] == 1
    assert result.summary["invalid"] == 1
    assert result.rows[0].valid is True
    assert result.rows[1].valid is False
    assert any("duplicate sku" in e.lower() for e in result.rows[1].errors)


def test_three_duplicates_only_first_passes():
    """N copies of the same SKU → 1 valid, N-1 flagged."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "dup,A,1,1\n"
        "dup,B,1,1\n"
        "dup,C,1,1\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["valid"] == 1
    assert result.summary["invalid"] == 2


def test_empty_sku_not_treated_as_duplicate():
    """Missing-SKU rows are already invalid for the empty-sku reason;
    they should not also be marked as duplicates of each other (which
    would be confusing — the real fix is to add SKUs)."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        ",First Missing,1,1\n"
        ",Second Missing,1,1\n"
    )
    result = bulk_import.preview("csv", csv_data)
    for row in result.rows:
        assert row.valid is False
        assert any("sku is required" in e for e in row.errors)
        assert not any("duplicate sku" in e.lower() for e in row.errors)


def test_blank_rows_are_skipped_and_counted():
    """Fully-empty rows shouldn't fail validation (Excel exports often have
    trailing blanks), but they SHOULD be surfaced in the summary so users
    aren't surprised by a missing row count."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "eggs,Eggs,3.99,4.19\n"
        ",,,\n"
        "milk,Milk,5.99,4.99\n"
        ",,,\n"
        ",,,\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["total"] == 2  # 2 real rows
    assert result.summary["valid"] == 2
    assert result.blank_rows_skipped == 3  # 3 blank rows dropped
    assert result.payload_errors == []


def test_partial_blank_row_with_only_prices_fails_validation():
    """A row that has prices but no SKU and no product_name should fail
    validation, not be silently skipped. Two errors expected."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        ",,5.99,4.99\n"
    )
    result = bulk_import.preview("csv", csv_data)
    assert result.summary["total"] == 1
    assert result.summary["invalid"] == 1
    assert result.blank_rows_skipped == 0  # this row WAS NOT blank
    row = result.rows[0]
    assert any("sku is required" in e for e in row.errors)
    assert any("product_name is required" in e for e in row.errors)

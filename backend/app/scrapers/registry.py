"""Spider registry — single source of truth for which sources are runnable.

Add a spider here to make it available via the API. The frontend reads
this list to render the "available sources" dropdown on /scrapers.
"""
from __future__ import annotations

from app.scrapers.base import Spider
from app.scrapers.spiders.books_demo import BooksDemoSpider

# Mapping: source_id → spider class. Order is preserved for UI display.
SPIDERS: dict[str, type[Spider]] = {
    BooksDemoSpider.SOURCE_ID: BooksDemoSpider,
    # WholeFoodsStubSpider intentionally not wired — see its docstring.
}


def get_spider(source_id: str) -> type[Spider] | None:
    return SPIDERS.get(source_id)


def list_sources() -> list[dict[str, str | int]]:
    """Serialisable list for the API + frontend."""
    return [
        {
            "source_id": spider.SOURCE_ID,
            "name": spider.NAME,
            "description": spider.DESCRIPTION,
            "start_url": spider.START_URL,
            "max_pages": spider.MAX_PAGES,
        }
        for spider in SPIDERS.values()
    ]

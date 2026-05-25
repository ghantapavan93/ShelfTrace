"""robots.txt enforcement.

The bare-minimum ethical/legal floor for any scraper: before fetching
a URL, check whether the site's robots.txt would block our User-Agent.
We cache the parsed file per host so we don't re-fetch it for every
page in a paginated run.

Uses the stdlib `urllib.robotparser` — battle-tested for 25+ years.
If robots.txt is unreachable (404, network error, malformed), we DEFAULT
TO ALLOW with a logged warning, which matches the convention most
crawlers use. Production might want to default-deny instead; that's a
single boolean flip.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

logger = logging.getLogger("shelftrace.scrapers.robots")

# Per-host cache. RobotFileParser objects are small and immutable post-parse.
_CACHE: dict[str, RobotFileParser] = {}


def _robots_url_for(target_url: str) -> str | None:
    parsed = urlparse(target_url)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}/robots.txt"


def _load(robots_url: str, client: httpx.Client) -> RobotFileParser:
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        response = client.get(robots_url, timeout=5.0)
        if response.status_code == 200:
            parser.parse(response.text.splitlines())
        else:
            # 404 = no robots.txt = everything allowed (per RFC 9309 §2.3.1.3)
            parser.parse([])
            logger.info(
                "robots.fetch_non200",
                extra={"url": robots_url, "status": response.status_code},
            )
    except Exception as exc:  # network error, malformed, etc.
        parser.parse([])
        logger.warning(
            "robots.fetch_failed",
            extra={"url": robots_url, "error": str(exc)[:200]},
        )
    return parser


def can_fetch(url: str, user_agent: str, client: httpx.Client) -> bool:
    """Returns True if our user_agent is allowed to fetch `url`.

    On any error, defaults to True (permissive). Callers should log
    when this returns False — those URLs were skipped intentionally.
    """
    robots_url = _robots_url_for(url)
    if robots_url is None:
        return True
    parser = _CACHE.get(robots_url)
    if parser is None:
        parser = _load(robots_url, client)
        _CACHE[robots_url] = parser
    try:
        return parser.can_fetch(user_agent, url)
    except Exception:
        return True  # parser bug → don't block the scrape


def crawl_delay(url: str, user_agent: str) -> float | None:
    """Returns the robots.txt-declared crawl delay (seconds) for this UA,
    or None if not declared / parser unloaded."""
    robots_url = _robots_url_for(url)
    if robots_url is None:
        return None
    parser = _CACHE.get(robots_url)
    if parser is None:
        return None
    try:
        delay = parser.crawl_delay(user_agent)
        return float(delay) if delay is not None else None
    except Exception:
        return None


def reset_cache_for_tests() -> None:
    """Used by the test suite to start each test from a clean cache."""
    _CACHE.clear()

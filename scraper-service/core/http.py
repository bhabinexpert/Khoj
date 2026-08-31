"""Polite HTTP layer for scrapers: robots.txt gating, rate limiting, retries.

Every network call in this service goes through :class:`PoliteSession`. It is
deliberately conservative — one request at a time per host, a configurable
minimum delay with jitter, and a hard refusal to fetch paths that the site's
``robots.txt`` disallows for our user agent.
"""

from __future__ import annotations

import logging
import random
import time
import urllib.robotparser as robotparser
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import requests

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "KhojBot/1.0 (+https://github.com/khoj/khoj; "
    "job aggregator for Nepal; contact: hello@khoj.example)"
)


class RobotsDisallowed(RuntimeError):
    """Raised when robots.txt forbids the requested path."""


@dataclass
class PoliteSession:
    """A requests session that behaves itself.

    Args:
        user_agent: Identifies the bot honestly, with a contact address.
        min_delay: Floor on the gap between two requests to the same host.
        jitter: Extra random delay added on top of ``min_delay``.
        timeout: Per-request timeout in seconds.
        max_retries: Retry budget for transient failures (5xx / network).
        obey_robots: When ``False`` (tests only) robots.txt is not consulted.
    """

    user_agent: str = DEFAULT_USER_AGENT
    min_delay: float = 3.0
    jitter: float = 1.5
    timeout: float = 20.0
    max_retries: int = 3
    obey_robots: bool = True

    _session: requests.Session = field(default_factory=requests.Session, repr=False)
    _last_request_at: dict[str, float] = field(default_factory=dict, repr=False)
    _robots: dict[str, robotparser.RobotFileParser | None] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        self._session.headers.update(
            {
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,ne;q=0.8",
            }
        )

    # ----------------------------------------------------------------- robots
    def _robots_for(self, url: str) -> robotparser.RobotFileParser | None:
        origin = "{0.scheme}://{0.netloc}".format(urlparse(url))
        if origin in self._robots:
            return self._robots[origin]

        parser = robotparser.RobotFileParser()
        robots_url = urljoin(origin + "/", "robots.txt")
        try:
            response = self._session.get(robots_url, timeout=self.timeout)
            if response.status_code >= 400:
                # No robots.txt published: RFC 9309 says treat as "allow all".
                logger.info("no robots.txt at %s (HTTP %s)", robots_url, response.status_code)
                parser = None
            else:
                parser.parse(response.text.splitlines())
        except requests.RequestException as exc:
            # Fail closed: if we cannot read the rules, do not crawl the host.
            logger.warning("could not fetch %s (%s) — treating host as disallowed", robots_url, exc)
            parser = robotparser.RobotFileParser()
            parser.parse(["User-agent: *", "Disallow: /"])

        self._robots[origin] = parser
        return parser

    def can_fetch(self, url: str) -> bool:
        if not self.obey_robots:
            return True
        parser = self._robots_for(url)
        if parser is None:
            return True
        return parser.can_fetch(self.user_agent, url) or parser.can_fetch("*", url)

    def crawl_delay(self, url: str) -> float:
        """Honour ``Crawl-delay`` when the site declares one."""
        if not self.obey_robots:
            return self.min_delay
        parser = self._robots_for(url)
        if parser is None:
            return self.min_delay
        try:
            declared = parser.crawl_delay(self.user_agent) or parser.crawl_delay("*")
        except AttributeError:  # pragma: no cover - very old Pythons
            declared = None
        return max(self.min_delay, float(declared or 0))

    # ------------------------------------------------------------------ fetch
    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        delay = self.crawl_delay(url) + random.uniform(0, self.jitter)
        last = self._last_request_at.get(host)
        if last is not None:
            elapsed = time.monotonic() - last
            if elapsed < delay:
                time.sleep(delay - elapsed)
        self._last_request_at[host] = time.monotonic()

    def get(self, url: str, **kwargs) -> requests.Response:
        """GET ``url`` politely. Raises :class:`RobotsDisallowed` if blocked."""
        if not self.can_fetch(url):
            raise RobotsDisallowed(f"robots.txt disallows {url}")

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            self._throttle(url)
            try:
                response = self._session.get(url, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                last_error = exc
                logger.warning("GET %s failed (attempt %s/%s): %s", url, attempt, self.max_retries, exc)
            else:
                if response.status_code == 429 or response.status_code >= 500:
                    last_error = requests.HTTPError(f"HTTP {response.status_code} for {url}")
                    retry_after = float(response.headers.get("Retry-After") or 0)
                    logger.warning("GET %s -> HTTP %s, backing off", url, response.status_code)
                    time.sleep(max(retry_after, self.min_delay * attempt * 2))
                    continue
                response.raise_for_status()
                return response
            time.sleep(self.min_delay * attempt)

        raise RuntimeError(f"giving up on {url}") from last_error

    def close(self) -> None:
        self._session.close()

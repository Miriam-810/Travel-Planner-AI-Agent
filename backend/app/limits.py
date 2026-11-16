"""Invite codes and daily limits.

Two kinds of request are counted separately, each per invite code per day and
for the whole site per day:

- "outline": POST /api/outline (Claude + Places searches, the expensive one)
- "trips":   POST /api/trips (Places details for every stop of a confirmed outline)
- "revise":  POST /api/outline/revise (a chat edit: Claude and a few searches)

Days follow Japan time, so the limits reset at midnight JST.
A slot is given back if the run fails, so errors on our side don't use up
someone's quota.

Counts live in SQLite. Fine for development and a single server; Render's free
disk is wiped on redeploy, so production moves this to Postgres (step 9).
"""

import sqlite3
import threading
from contextlib import closing
from datetime import date
from pathlib import Path


class InvalidInviteCode(Exception):
    pass


class DailyLimitReached(Exception):
    def __init__(self, scope: str):
        super().__init__(scope)
        self.scope = scope  # "code" or "site"


SITE = "*"


class UsageLimiter:
    def __init__(self, db_path: str | Path, codes: set[str], limits: dict[str, tuple[int, int]]):
        """`limits` maps a kind to (per code per day, whole site per day)."""
        self.db_path = str(db_path)
        self.codes = codes
        self.limits = limits
        self._lock = threading.Lock()
        with closing(self._connect()) as db, db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS usage (day TEXT, code TEXT, count INTEGER, PRIMARY KEY (day, code))"
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def check_code(self, code: str | None) -> str:
        if not code or code.strip() not in self.codes:
            raise InvalidInviteCode()
        return code.strip()

    def reserve(self, code: str, day: date, kind: str) -> None:
        """Take one `kind` slot for `code` on `day`, or raise DailyLimitReached."""
        code = self.check_code(code)
        per_code, per_site = self.limits[kind]
        with self._lock, closing(self._connect()) as db, db:
            if self._count(db, day, f"{kind}:{SITE}") >= per_site:
                raise DailyLimitReached("site")
            if self._count(db, day, f"{kind}:{code}") >= per_code:
                raise DailyLimitReached("code")
            for key in (f"{kind}:{code}", f"{kind}:{SITE}"):
                db.execute(
                    "INSERT INTO usage VALUES (?, ?, 1) ON CONFLICT (day, code) DO UPDATE SET count = count + 1",
                    (day.isoformat(), key),
                )

    def release(self, code: str, day: date, kind: str) -> None:
        """Give back a slot taken by reserve()."""
        with self._lock, closing(self._connect()) as db, db:
            for key in (f"{kind}:{code.strip()}", f"{kind}:{SITE}"):
                db.execute(
                    "UPDATE usage SET count = MAX(count - 1, 0) WHERE day = ? AND code = ?", (day.isoformat(), key)
                )

    def remaining(self, code: str, day: date, kind: str) -> int:
        code = self.check_code(code)
        per_code, per_site = self.limits[kind]
        with closing(self._connect()) as db:
            left_code = per_code - self._count(db, day, f"{kind}:{code}")
            left_site = per_site - self._count(db, day, f"{kind}:{SITE}")
            return max(0, min(left_code, left_site))

    @staticmethod
    def _count(db: sqlite3.Connection, day: date, code: str) -> int:
        row = db.execute("SELECT count FROM usage WHERE day = ? AND code = ?", (day.isoformat(), code)).fetchone()
        return row[0] if row else 0

"""Invite codes and daily limits for generating outlines.

Each POST /api/outline takes one slot: per invite code per day, and for the
whole site per day. Days follow Japan time, so the limits reset at midnight JST.
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
    def __init__(self, db_path: str | Path, codes: set[str], *, per_code: int, per_site: int):
        self.db_path = str(db_path)
        self.codes = codes
        self.per_code = per_code
        self.per_site = per_site
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

    def reserve(self, code: str, day: date) -> None:
        """Take one slot for `code` on `day`, or raise DailyLimitReached."""
        code = self.check_code(code)
        with self._lock, closing(self._connect()) as db, db:
            if self._count(db, day, SITE) >= self.per_site:
                raise DailyLimitReached("site")
            if self._count(db, day, code) >= self.per_code:
                raise DailyLimitReached("code")
            for key in (code, SITE):
                db.execute(
                    "INSERT INTO usage VALUES (?, ?, 1) ON CONFLICT (day, code) DO UPDATE SET count = count + 1",
                    (day.isoformat(), key),
                )

    def release(self, code: str, day: date) -> None:
        """Give back a slot taken by reserve()."""
        with self._lock, closing(self._connect()) as db, db:
            for key in (code.strip(), SITE):
                db.execute(
                    "UPDATE usage SET count = MAX(count - 1, 0) WHERE day = ? AND code = ?", (day.isoformat(), key)
                )

    def remaining(self, code: str, day: date) -> int:
        code = self.check_code(code)
        with closing(self._connect()) as db:
            return max(0, min(self.per_code - self._count(db, day, code), self.per_site - self._count(db, day, SITE)))

    @staticmethod
    def _count(db: sqlite3.Connection, day: date, code: str) -> int:
        row = db.execute("SELECT count FROM usage WHERE day = ? AND code = ?", (day.isoformat(), code)).fetchone()
        return row[0] if row else 0

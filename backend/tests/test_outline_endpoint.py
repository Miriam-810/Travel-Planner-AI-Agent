from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.agent.loop import AgentError, AgentRefused, AgentResult, AgentStats
from app.limits import DailyLimitReached, InvalidInviteCode
from app.main import app, get_agent_runner, get_limiter, get_registry
from app.models import TripOutline
from tests.agent_fixtures import REQUEST, valid_outline
from tests.conftest import INVITE, make_limiter, sample_registry

BODY = REQUEST.model_dump(mode="json")


class Runner:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls = 0
        self.revisions = []

    async def __call__(self, request, revision=None):
        self.calls += 1
        self.revisions.append(revision)
        if self.error:
            raise self.error
        return AgentResult(
            outline=TripOutline.model_validate(valid_outline()),
            warnings=["12/8 缺少晚餐"],
            stats=AgentStats(model="claude-haiku-5-5", turns=3, tool_calls=20, searches=18),
            summary="把第二天下午換成博物館",
        )


@pytest.fixture
def setup(tmp_path):
    def make(runner=None, per_code=3, per_site=20):
        runner = runner or Runner()
        app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path, per_code=per_code, per_site=per_site)
        app.dependency_overrides[get_agent_runner] = lambda: runner
        return TestClient(app), runner

    yield make
    app.dependency_overrides.clear()


def test_outline_returns_outline_warnings_and_quota(setup):
    client, runner = setup()
    res = client.post("/api/outline", json=BODY, headers=INVITE)

    assert res.status_code == 200, res.text
    data = res.json()
    assert len(data["outline"]["days"]) == 5
    assert data["warnings"] == ["12/8 缺少晚餐"]
    assert data["remaining_today"] == 2
    assert data["stats"]["searches"] == 18 and data["stats"]["places_usd"] == pytest.approx(0.63)


@pytest.mark.parametrize("headers", [{}, {"X-Invite-Code": "wrong"}])
def test_missing_or_wrong_invite_code_is_401(setup, headers):
    client, runner = setup()
    res = client.post("/api/outline", json=BODY, headers=headers)
    assert res.status_code == 401 and runner.calls == 0


def test_fourth_outline_of_the_day_is_429(setup):
    client, runner = setup()
    for _ in range(3):
        assert client.post("/api/outline", json=BODY, headers=INVITE).status_code == 200
    res = client.post("/api/outline", json=BODY, headers=INVITE)

    assert res.status_code == 429 and "邀請碼" in res.json()["detail"]
    assert runner.calls == 3


def test_site_limit_applies_across_codes(setup):
    client, _ = setup(per_site=1)
    assert client.post("/api/outline", json=BODY, headers=INVITE).status_code == 200
    res = client.post("/api/outline", json=BODY, headers={"X-Invite-Code": "other-code"})
    assert res.status_code == 429 and "整個網站" in res.json()["detail"]


@pytest.mark.parametrize(("error", "status"), [(AgentError("boom"), 502), (AgentRefused("no"), 422)])
def test_failed_runs_do_not_use_up_the_quota(setup, error, status):
    client, _ = setup(runner=Runner(error=error))
    res = client.post("/api/outline", json=BODY, headers=INVITE)
    assert res.status_code == status

    remaining = client.get("/api/invite", headers=INVITE).json()["remaining_today"]
    assert remaining == 3


def test_invite_endpoint(setup):
    client, _ = setup()
    assert client.get("/api/invite", headers=INVITE).json() == {"remaining_today": 3}
    assert client.get("/api/invite", headers={"X-Invite-Code": "nope"}).status_code == 401


def test_outline_without_keys_is_503(tmp_path):
    app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path)
    app.dependency_overrides[get_registry] = sample_registry
    try:
        res = TestClient(app).post("/api/outline", json=BODY, headers=INVITE)
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 503


# --- limiter on its own --------------------------------------------------------


def test_limits_reset_each_day(tmp_path):
    limiter = make_limiter(tmp_path, per_code=1)
    limiter.reserve("test-code", date(2026, 12, 1), "outline")
    with pytest.raises(DailyLimitReached):
        limiter.reserve("test-code", date(2026, 12, 1), "outline")
    limiter.reserve("test-code", date(2026, 12, 2), "outline")
    limiter.reserve("test-code", date(2026, 12, 1), "trips")  # counted separately


def test_codes_are_trimmed_and_checked(tmp_path):
    limiter = make_limiter(tmp_path)
    assert limiter.check_code(" test-code ") == "test-code"
    with pytest.raises(InvalidInviteCode):
        limiter.check_code("")


# --- POST /api/outline/revise --------------------------------------------------

REVISE = {"request": BODY, "outline": valid_outline(), "message": "第二天下午想去博物館", "history": [{"role": "user", "text": "輕鬆一點"}]}


def test_revise_passes_the_outline_and_message_and_returns_the_reply(setup):
    client, runner = setup()
    res = client.post("/api/outline/revise", json=REVISE, headers=INVITE)

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["reply"] == "把第二天下午換成博物館"
    assert data["remaining_today"] == 1  # revise has its own quota (2 in tests), separate from outlines
    rev = runner.revisions[0]
    assert rev.message == "第二天下午想去博物館" and rev.history[0].text == "輕鬆一點"
    assert len(rev.outline.days) == 5


def test_revise_quota_is_separate_and_limited(setup):
    client, _ = setup()
    for _ in range(2):
        assert client.post("/api/outline/revise", json=REVISE, headers=INVITE).status_code == 200
    assert client.post("/api/outline/revise", json=REVISE, headers=INVITE).status_code == 429
    assert client.post("/api/outline", json=BODY, headers=INVITE).status_code == 200  # outlines unaffected


@pytest.mark.parametrize("message", ["", "   ", "長" * 501])
def test_revise_rejects_empty_or_long_messages(setup, message):
    client, runner = setup()
    res = client.post("/api/outline/revise", json={**REVISE, "message": message}, headers=INVITE)
    assert res.status_code == 422 and runner.calls == 0


def test_revise_rejects_outline_with_other_dates(setup):
    client, runner = setup()
    outline = valid_outline()
    outline["days"] = outline["days"][:3]
    res = client.post("/api/outline/revise", json={**REVISE, "outline": outline}, headers=INVITE)
    assert res.status_code == 422 and runner.calls == 0


def test_failed_revise_does_not_use_up_the_quota(setup):
    client, _ = setup(Runner(AgentError("boom")))
    for _ in range(3):
        assert client.post("/api/outline/revise", json=REVISE, headers=INVITE).status_code == 502

import pytest

from app.agent.loop import FALLBACK_BETA, AgentError, AgentRefused, run_agent
from tests.agent_fixtures import (
    REQUEST,
    TODAY,
    FakeLLM,
    fake_providers,
    fake_weather,
    response,
    tool_use,
    valid_outline,
)

pytestmark = pytest.mark.anyio

SEARCHES = [
    tool_use("search_place", {"query": q, "lat": 40.82, "lng": 140.74, "radius_m": 99999, "date": "2026-12-08"}, f"s-{q}")
    for q in ("lunch", "dinner", "museum", "park", "shop")
]
WEATHER = tool_use("get_weather", {"lat": 40.82, "lng": 140.74, "date": "2026-12-07"}, "w1")


def submit(outline, id_="sub"):
    return tool_use("submit_outline", outline, id_)


def bad_outline():
    o = valid_outline()
    o["days"][1]["stops"].pop()  # no dinner on 12/8
    return o


async def run(llm, model="claude-haiku-5-5"):
    return await run_agent(REQUEST, llm=llm, model=model, effort="medium", providers=fake_providers(), weather=fake_weather, today=TODAY)


async def test_search_then_submit():
    llm = FakeLLM([response(*SEARCHES, WEATHER), response(submit(valid_outline()))])
    result = await run(llm)

    assert result.warnings == []
    assert len(result.outline.days) == 5
    assert result.stats.turns == 2 and result.stats.searches == 5 and result.stats.weather_calls == 1
    assert set(result.places) == {"lunch", "dinner", "museum", "park", "shop"}

    first = llm.calls[0]
    assert first["output_config"] == {"effort": "medium"}
    assert all(t["strict"] for t in first["tools"])
    assert "fallbacks" not in first  # Haiku 5.5 has no server-side fallback

    tool_results = llm.calls[1]["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in tool_results] == ["s-lunch", "s-dinner", "s-museum", "s-park", "s-shop", "w1"]
    assert '"hours_on_date": "11:00–15:00"' in tool_results[0]["content"]


async def test_invalid_outline_goes_back_as_tool_error():
    llm = FakeLLM([response(*SEARCHES), response(submit(bad_outline(), "a")), response(submit(valid_outline(), "b"))])
    result = await run(llm)

    assert result.warnings == []
    error = llm.calls[2]["messages"][-1]["content"][0]
    assert error["is_error"] is True and error["tool_use_id"] == "a"
    assert "12/8 缺少晚餐" in error["content"]


async def test_after_two_retries_the_outline_is_accepted_with_warnings():
    llm = FakeLLM([response(*SEARCHES)] + [response(submit(bad_outline(), f"x{i}")) for i in range(3)])
    result = await run(llm)

    assert result.stats.submits == 3
    assert result.warnings == ["12/8 缺少晚餐"]


async def test_schema_errors_are_reported():
    broken = valid_outline()
    broken["days"][0]["stops"][0]["meal"] = None  # meal stop without lunch/dinner
    llm = FakeLLM([response(*SEARCHES), response(submit(broken, "a")), response(submit(valid_outline(), "b"))])
    await run(llm)

    error = llm.calls[2]["messages"][-1]["content"][0]
    assert error["is_error"] and "meal" in error["content"]


async def test_refusal_stops_the_run():
    llm = FakeLLM([response(stop_reason="refusal", category="general_harms")])
    with pytest.raises(AgentRefused, match="general_harms"):
        await run(llm)


async def test_stopping_without_submitting_gets_one_nudge():
    text = __import__("types").SimpleNamespace(type="text", text="好的")
    llm = FakeLLM([response(text, stop_reason="end_turn"), response(text, stop_reason="end_turn")])
    with pytest.raises(AgentError, match="without submitting"):
        await run(llm)
    assert "submit_outline" in llm.calls[1]["messages"][-1]["content"]


async def test_failed_search_is_a_tool_error_not_a_crash():
    from app.providers.base import PlacesError

    llm = FakeLLM([response(SEARCHES[0])] + [response(submit(valid_outline(), f"x{i}")) for i in range(3)])
    result = await run_agent(REQUEST, llm=llm, model="claude-haiku-5-5", effort="medium", providers=fake_providers(PlacesError("Places HTTP 429: quota")), weather=fake_weather, today=TODAY)

    first_result = llm.calls[1]["messages"][-1]["content"][0]
    assert first_result["is_error"] and "quota" in first_result["content"]
    assert result.warnings  # nothing was found, so the place_ids are unknown


async def test_opus_requests_server_side_fallback():
    llm = FakeLLM([response(*SEARCHES), response(submit(valid_outline()))])
    await run(llm, model="claude-opus-5-5")

    assert llm.calls[0]["fallbacks"] == "default"
    assert llm.calls[0]["betas"] == [FALLBACK_BETA]


async def test_cost_estimate():
    llm = FakeLLM([response(*SEARCHES), response(submit(valid_outline()))])
    stats = (await run(llm)).stats
    # 2 turns × (1000 in × $0.10 + 500 out × $0.50) per million
    assert stats.claude_usd == pytest.approx(0.0007)
    assert stats.places_usd == pytest.approx(5 * 0.035)


# --- revisions -----------------------------------------------------------------


def revision(message="第二天想改去公園"):
    from app.models import Revision, TripOutline

    return Revision(outline=TripOutline.model_validate(valid_outline()), message=message)


async def run_revision(llm, rev):
    return await run_agent(
        REQUEST, llm=llm, model="claude-haiku-5-5", effort="medium", providers=fake_providers(),
        weather=fake_weather, today=TODAY, revision=rev,
    )  # fmt: skip


async def test_revision_keeps_existing_stops_valid_without_searching_again():
    # Claude changes nothing it wasn't asked to; the existing places were looked up up front.
    llm = FakeLLM([response(submit({**valid_outline(), "summary": "第二天下午改去公園"}))])
    result = await run_revision(llm, revision())

    assert result.warnings == []
    assert result.summary == "第二天下午改去公園"
    assert result.stats.searches == 0 and result.stats.details == 5  # lunch, park, dinner, museum, shop
    opening = llm.calls[0]["messages"][0]["content"]
    assert "current_outline" in opening and opening.rstrip().endswith("第二天想改去公園")


async def test_revision_uses_the_same_system_prompt_as_planning():
    # Same system prompt and tools, so the prompt cache is shared between planning and revising.
    plan_llm = FakeLLM([response(*SEARCHES), response(submit(valid_outline()))])
    await run(plan_llm)
    rev_llm = FakeLLM([response(submit(valid_outline()))])
    await run_revision(rev_llm, revision())
    assert plan_llm.calls[0]["system"] == rev_llm.calls[0]["system"]
    assert plan_llm.calls[0]["tools"] == rev_llm.calls[0]["tools"]


async def test_submit_outline_asks_for_a_summary():
    from app.agent.tools import SUBMIT_OUTLINE

    assert "summary" in SUBMIT_OUTLINE["input_schema"]["required"]

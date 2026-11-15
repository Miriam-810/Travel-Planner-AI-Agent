"""The planning agent: a hand-written tool-use loop around the Messages API.

Claude calls get_weather and search_place as often as it needs (within the
limits), then submit_outline. The program validates the outline; problems go
back as an `is_error` tool result, up to MAX_SUBMIT_RETRIES times. After that
the last outline is accepted and its problems become warnings for the user.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pydantic import ValidationError

from app.agent.prompts import first_message, system_prompt
from app.agent.tools import TOOLS, clamp_radius, search_result, weather_result
from app.agent.validate import validate_outline
from app.models import TripOutline, TripRequest, Weather
from app.providers.base import Place, PlacesError, Providers
from app.tools.weather import WeatherError

log = logging.getLogger(__name__)

MAX_TURNS = 12
MAX_TOOL_CALLS = 60
MAX_SUBMIT_RETRIES = 2
MAX_NUDGES = 1
MAX_TOKENS = 16000
LONG_PROMPT_WARNING = 80_000  # Haiku 5.5 bills 5x above 100K prompt tokens

# Models that accept server-side refusal fallbacks. Haiku 5.5 has none.
FALLBACK_MODELS = {"claude-opus-5-5"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# USD per million tokens: input, output. Cache reads 0.1x input, 5-minute cache writes 1.25x.
PRICES = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-opus-5-5": (4.00, 20.00),
}
PLACES_SEARCH_USD = 0.035  # Text Search Enterprise, after the monthly free 1,000

WeatherFn = Callable[[float, float, date], Awaitable[Weather]]


class AgentError(Exception):
    """The agent could not produce an outline."""


class AgentRefused(AgentError):
    pass


@dataclass
class AgentStats:
    model: str
    turns: int = 0
    tool_calls: int = 0
    searches: int = 0
    weather_calls: int = 0
    submits: int = 0
    input_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    output_tokens: int = 0
    max_prompt_tokens: int = 0

    def add_usage(self, usage: Any) -> int:
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        self.input_tokens += usage.input_tokens
        self.cache_read_tokens += cache_read
        self.cache_write_tokens += cache_write
        self.output_tokens += usage.output_tokens
        prompt = usage.input_tokens + cache_read + cache_write
        self.max_prompt_tokens = max(self.max_prompt_tokens, prompt)
        return prompt

    @property
    def claude_usd(self) -> float | None:
        if self.model not in PRICES:
            return None
        inp, out = PRICES[self.model]
        if self.model == "claude-haiku-5-5" and self.max_prompt_tokens > 100_000:
            inp, out = inp * 5, out * 5  # approximate: assumes every turn was in the long-prompt tier
        total = (
            self.input_tokens * inp
            + self.cache_read_tokens * inp * 0.1
            + self.cache_write_tokens * inp * 1.25
            + self.output_tokens * out
        )
        return round(total / 1_000_000, 4)

    @property
    def places_usd(self) -> float:
        return round(self.searches * PLACES_SEARCH_USD, 4)


@dataclass
class AgentResult:
    outline: TripOutline
    warnings: list[str]
    stats: AgentStats
    places: dict[str, Place] = field(default_factory=dict)


async def run_agent(
    request: TripRequest,
    *,
    llm: Any,
    model: str,
    effort: str,
    providers: Providers,
    weather: WeatherFn,
    today: date,
) -> AgentResult:
    """Plan `request` with the country's providers. Nothing here is country-specific.

    `llm` is an anthropic.AsyncAnthropic (or a test double with the same `beta.messages.create`).
    `weather` is get_weather bound to the HTTP client and the country's timezone.
    """
    stats = AgentStats(model=model)
    places: dict[str, Place] = {}
    system = system_prompt(providers.country)
    messages: list[dict] = [{"role": "user", "content": first_message(request, providers.country, today=today)}]
    nudges = 0
    last_valid: TripOutline | None = None
    last_errors: list[str] = []

    extra: dict[str, Any] = {}
    if model in FALLBACK_MODELS:
        extra = {"betas": [FALLBACK_BETA], "fallbacks": "default"}

    for _ in range(MAX_TURNS):
        stats.turns += 1
        resp = await llm.beta.messages.create(
            model=model,
            max_tokens=MAX_TOKENS,
            system=system,
            tools=TOOLS,
            messages=messages,
            output_config={"effort": effort},
            cache_control={"type": "ephemeral"},
            **extra,
        )
        prompt_tokens = stats.add_usage(resp.usage)
        log.info(
            "turn %d: stop=%s prompt=%d output=%d", stats.turns, resp.stop_reason, prompt_tokens, resp.usage.output_tokens
        )
        if prompt_tokens > LONG_PROMPT_WARNING:
            log.warning("prompt is %d tokens; Haiku 5.5 bills 5x above 100K", prompt_tokens)

        if resp.stop_reason == "refusal":
            category = getattr(getattr(resp, "stop_details", None), "category", None)
            raise AgentRefused(f"Claude declined this request ({category or 'no category'})")
        if resp.stop_reason == "max_tokens":
            raise AgentError("Claude ran out of output tokens before finishing a turn")

        messages.append({"role": "assistant", "content": resp.content})
        tool_uses = [b for b in resp.content if b.type == "tool_use"]

        if not tool_uses:
            nudges += 1
            if nudges > MAX_NUDGES:
                raise AgentError("Claude stopped without submitting an outline")
            messages.append({"role": "user", "content": "請用 submit_outline 工具送出完整的行程大綱。"})
            continue

        results = []
        for block in tool_uses:
            stats.tool_calls += 1
            if block.name == "submit_outline":
                stats.submits += 1
                outline, errors = _check_submission(block.input, request, places, today)
                if outline is not None:
                    last_valid, last_errors = outline, errors
                    if not errors or stats.submits > MAX_SUBMIT_RETRIES:
                        return AgentResult(outline=outline, warnings=errors, stats=_logged(stats), places=places)
                results.append(_error_result(block.id, "行程大綱有以下問題，請只修正這些地方再送出一次：\n- " + "\n- ".join(errors)))
            elif stats.tool_calls > MAX_TOOL_CALLS:
                results.append(_error_result(block.id, "工具呼叫次數已用完。請用已經查到的地點，直接呼叫 submit_outline。"))
            else:
                results.append(None)  # filled in below, concurrently

        pending = [(i, b) for i, (b, r) in enumerate(zip(tool_uses, results)) if r is None]
        done = await asyncio.gather(*(_run_tool(b, providers, weather, places, stats, today) for _, b in pending))
        for (i, _), r in zip(pending, done):
            results[i] = r
        messages.append({"role": "user", "content": results})

    if last_valid is not None:
        return AgentResult(outline=last_valid, warnings=last_errors, stats=_logged(stats), places=places)
    raise AgentError(f"no outline after {MAX_TURNS} turns")


def _logged(stats: AgentStats) -> AgentStats:
    log.info(
        "agent done: model=%s turns=%d tools=%d searches=%d weather=%d submits=%d "
        "input=%d cache_read=%d cache_write=%d output=%d max_prompt=%d claude=$%s places=$%s",
        stats.model, stats.turns, stats.tool_calls, stats.searches, stats.weather_calls, stats.submits,
        stats.input_tokens, stats.cache_read_tokens, stats.cache_write_tokens, stats.output_tokens,
        stats.max_prompt_tokens, stats.claude_usd, stats.places_usd,
    )  # fmt: skip
    return stats


def _check_submission(
    raw: dict, request: TripRequest, places: dict[str, Place], today: date
) -> tuple[TripOutline | None, list[str]]:
    try:
        outline = TripOutline.model_validate(raw)
    except ValidationError as exc:
        problems = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        return None, problems
    return outline, validate_outline(request, outline, places, today=today)


def _error_result(tool_use_id: str, message: str) -> dict:
    return {"type": "tool_result", "tool_use_id": tool_use_id, "content": message, "is_error": True}


async def _run_tool(
    block: Any, providers: Providers, weather: WeatherFn, places: dict[str, Place], stats: AgentStats, today: date
) -> dict:
    args = block.input
    try:
        if block.name == "search_place":
            stats.searches += 1
            day = date.fromisoformat(args["date"])
            found = await providers.places.search(
                args["query"], args["lat"], args["lng"], radius_m=clamp_radius(args["radius_m"])
            )
            places.update({p.place_id: p for p in found})
            content = search_result(found, day, today=today)
        elif block.name == "get_weather":
            stats.weather_calls += 1
            w = await weather(args["lat"], args["lng"], date.fromisoformat(args["date"]))
            content = weather_result(w)
        else:
            return _error_result(block.id, f"unknown tool {block.name}")
    except (PlacesError, WeatherError, ValueError) as exc:
        return _error_result(block.id, f"{block.name} failed: {exc}")
    return {"type": "tool_result", "tool_use_id": block.id, "content": content}

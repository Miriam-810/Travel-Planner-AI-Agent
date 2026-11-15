from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings, read from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Claude model for the agent loop. Haiku 5.5 during development; switch to
    # claude-opus-5-5 for evals and demos.
    model: str = "claude-haiku-5-5"

    # Reasoning effort, always sent explicitly: low | medium | high | xhigh | max.
    effort: str = "medium"

    # Anthropic API key for the planning agent. Empty → POST /api/outline returns 503.
    anthropic_api_key: str = ""

    # Comma-separated invite codes that may generate outlines, and the daily limits.
    invite_codes: str = ""
    daily_limit_per_code: int = 3
    daily_limit_site: int = 20
    # POST /api/trips: each call looks up every stop on Google Places (up to 8 × 12).
    daily_trips_per_code: int = 10
    daily_trips_site: int = 50
    usage_db_path: str = "usage.sqlite"

    # Server-side key for Google Places API (New). Empty → POST /api/trips only
    # accepts the sample trip's place ids.
    google_places_api_key: str = ""

    # Serve the interactive API docs (/docs, /redoc, /openapi.json). Set
    # ENABLE_DOCS=false in production so the API isn't advertised.
    enable_docs: bool = True

    # Comma-separated origins allowed to call the API from a browser. In local
    # development the Vite dev server proxies /api, so this is only needed once
    # the frontend is deployed on another domain.
    cors_origins: str = ""

    @property
    def invite_code_set(self) -> set[str]:
        return {c.strip() for c in self.invite_codes.split(",") if c.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

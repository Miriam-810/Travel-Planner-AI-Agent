from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings, read from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Claude model for the agent loop. Haiku 5.5 during development; switch to
    # claude-opus-5-5 for evals and demos.
    model: str = "claude-haiku-5-5"

    # Server-side key for Google Places API (New). Empty → POST /api/trips only
    # accepts the sample trip's place ids.
    google_places_api_key: str = ""

    # Comma-separated origins allowed to call the API from a browser. In local
    # development the Vite dev server proxies /api, so this is only needed once
    # the frontend is deployed on another domain.
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

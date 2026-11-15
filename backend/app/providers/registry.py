"""Which countries the planner supports, and how to build their providers.

To add a country: write app/providers/<country>.py with a Country and a
function returning Providers, then add one line to `build_registry`.
"""

from functools import partial

import httpx2

from app.models import Trip
from app.providers.base import Providers, ProviderRegistry
from app.providers.japan import JAPAN, japan_providers
from app.providers.sample import SamplePlaceProvider


def build_registry(client: httpx2.AsyncClient, *, places_api_key: str, sample: Trip) -> ProviderRegistry:
    if not places_api_key:
        # No key: only the sample trip's places resolve, enough to develop the frontend offline.
        return ProviderRegistry({"JP": lambda: Providers(country=JAPAN, places=SamplePlaceProvider(sample))})
    return ProviderRegistry({
        "JP": partial(japan_providers, client, places_api_key),
        # "KR": partial(korea_providers, client, ...),
    })

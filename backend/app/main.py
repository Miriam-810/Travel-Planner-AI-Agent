from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()

app = FastAPI(title="Travel Planner AI Agent", version="0.1.0")

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Invite-Code"],
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.model}

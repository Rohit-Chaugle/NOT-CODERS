"""Verdant Twin API — FastAPI application entrypoint.

Run from the backend/ folder:
    uvicorn app.main:app --reload

On startup it creates the SQLite schema, seeds the campus if empty and starts
the background sensor simulator.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_NAME, APP_VERSION, CORS_ORIGINS, SIM_ENABLED
from app.database import SessionLocal, init_db
from app.models import Building
from app.routers import ai, issues, sensors, stats, twin, vision, ws
from app.schemas import HealthOut
from app.seed import seed_campus
from app.services.simulator import run_simulator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("verdant.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        if db.query(Building).count() == 0:
            counts = seed_campus(db)
            logger.info("Seeded campus: %s", counts)

    task: asyncio.Task | None = None
    if SIM_ENABLED:
        task = asyncio.create_task(run_simulator())

    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["system"])
def root():
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "status": "online",
        "docs": "/docs",
        "health": "/api/health",
        "frontend": "http://localhost:5173",
    }


@app.get("/api/health", response_model=HealthOut, tags=["system"])
@app.get("/health", response_model=HealthOut, include_in_schema=False)
def health() -> HealthOut:
    return HealthOut(status="ok", app=APP_NAME, version=APP_VERSION)



app.include_router(twin.router)
app.include_router(sensors.router)
app.include_router(issues.router)
app.include_router(stats.router)
app.include_router(vision.router)
app.include_router(ai.router)
app.include_router(ws.router)

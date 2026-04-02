"""
Replay API

FastAPI service serving recorded run data to the replay UI.
Reads from TimescaleDB.

Endpoints:
  GET /api/runs                           — list all runs
  GET /api/runs/{run_id}                  — run metadata
  GET /api/runs/{run_id}/events           — query events
  GET /api/runs/{run_id}/events/snapshot  — full state at time T
  GET /api/runs/{run_id}/scorecard        — scorecard
"""

import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

DB_DSN = (
    f"postgresql://{os.environ.get('GL_DB_USER', 'gl')}:"
    f"{os.environ.get('GL_DB_PASSWORD', 'gl_dev')}@"
    f"{os.environ.get('GL_DB_HOST', 'localhost')}:"
    f"{os.environ.get('GL_DB_PORT', '5432')}/"
    f"{os.environ.get('GL_DB_NAME', 'ghost_lattice')}"
)

pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DB_DSN, min_size=2, max_size=10)
    yield
    await pool.close()


app = FastAPI(title="Ghost Lattice Replay API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/runs")
async def list_runs():
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT run_id, scenario_id, started_at, completed_at, status, duration_sec, vehicle_count "
            "FROM runs ORDER BY started_at DESC LIMIT 100"
        )
    return [dict(r) for r in rows]


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM runs WHERE run_id = $1", run_id)
    if not row:
        return {"error": "Run not found"}, 404
    return dict(row)


@app.get("/api/runs/{run_id}/events")
async def get_events(
    run_id: str,
    types: str = Query(default="", description="Comma-separated event types"),
    t_start: float = Query(default=0, description="Start time offset (sec)"),
    t_end: float = Query(default=9999, description="End time offset (sec)"),
    limit: int = Query(default=50000, le=100000),
):
    type_filter = ""
    params = [run_id, limit]

    if types:
        type_list = [t.strip() for t in types.split(",")]
        placeholders = ", ".join(f"${i+3}" for i in range(len(type_list)))
        type_filter = f"AND event_type IN ({placeholders})"
        params.extend(type_list)

    query = f"""
        SELECT ts, seq, event_type, entity_id, payload
        FROM events
        WHERE run_id = $1
        {type_filter}
        ORDER BY seq
        LIMIT $2
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return [
        {
            "ts": r["ts"].isoformat(),
            "seq": r["seq"],
            "event_type": r["event_type"],
            "entity_id": r["entity_id"],
            "payload": r["payload"],
        }
        for r in rows
    ]


@app.get("/api/runs/{run_id}/scorecard")
async def get_scorecard(run_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM scorecards WHERE run_id = $1", run_id
        )
    if not row:
        return {"error": "Scorecard not found"}, 404
    return dict(row)

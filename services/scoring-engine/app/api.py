"""Scoring Engine API."""

import os

from fastapi import FastAPI
from pydantic import BaseModel

from .metrics import compute_scorecard, Scorecard

app = FastAPI(title="Ghost Lattice Scoring Engine", version="0.1.0")


class ScoreRequest(BaseModel):
    run_id: str
    scenario_id: str = "mission_001"
    events: list[dict]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/score", response_model=Scorecard)
def compute_score(req: ScoreRequest):
    """Compute scorecard from event list."""
    return compute_scorecard(req.events, req.run_id, req.scenario_id)

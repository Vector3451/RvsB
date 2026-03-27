"""
RvsB FastAPI Server — Competition-compliant HTTP API.

Required endpoints (OpenEnv spec):
  POST /reset   — start new episode
  POST /step    — execute one action
  GET  /state   — episode metadata

Competition additional endpoints:
  GET  /tasks    — list tasks and action schemas
  GET  /grader   — current grader score
  POST /baseline — run baseline inference and return scores
"""
import sys
from pathlib import Path

# Ensure src/ is on path when running inside Docker
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import subprocess
from dataclasses import asdict
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from api.dashboard_api import dashboard_router

from envs.rvsb_env.models import (
    ExfiltrateAction,
    ExploitAction,
    ReconAction,
)
from envs.rvsb_env.server.environment import RvsBEnvironment

app = FastAPI(
    title="RvsB CTF Environment",
    description="OpenEnv-compliant Red Team vs Blue Team CTF competition environment.",
    version="1.0.0",
)

# Singleton environment instance
_env = RvsBEnvironment()


# ---------------------------------------------------------------------------
# Request / Response Schemas (Pydantic for FastAPI validation)
# ---------------------------------------------------------------------------
class ResetRequest(BaseModel):
    config: Dict[str, Any] = {}

class ActionRequest(BaseModel):
    type: str                          # 'recon' | 'exploit' | 'exfiltrate'
    target_ip: str = "10.0.0.1"       # recon
    scan_intensity: str = "passive"   # recon: 'passive' | 'slow' | 'aggressive'
    target_service: str = "ssh"       # exploit
    payload: str = ""                 # exploit
    file_path: str = "/root/flag.txt" # exfiltrate
    data: str = ""                    # exfiltrate
    metadata: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Core OpenEnv Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health", status_code=200)
def health_check():
    """Health probe — can be used for monitoring."""
    return {"status": "ok", "env": "rvsb-ctf", "version": "1.0.0"}


@app.post("/reset")
def reset(req: ResetRequest = None):
    """Start a new episode. Returns initial observation."""
    config = req.config if req else {}
    obs = _env.reset(config)
    return JSONResponse(content=asdict(obs))


@app.post("/step")
def step(request: ActionRequest):
    """Execute one action, advance simulation, return observation."""
    action_type = request.type.lower()

    if action_type == "recon":
        action = ReconAction(
            target_ip=request.target_ip,
            scan_intensity=request.scan_intensity,
            metadata=request.metadata,
        )
    elif action_type == "exploit":
        action = ExploitAction(
            target_service=request.target_service,
            payload=request.payload,
            metadata=request.metadata,
        )
    elif action_type == "exfiltrate":
        action = ExfiltrateAction(
            file_path=request.file_path,
            data=request.data,
            metadata=request.metadata,
        )
    else:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown action type '{action_type}'. Must be: recon | exploit | exfiltrate",
        )

    obs = _env.step(action)
    return JSONResponse(content=asdict(obs))


@app.get("/state")
def state():
    """Return current episode metadata."""
    return JSONResponse(content=asdict(_env.state))


# ---------------------------------------------------------------------------
# Competition Additional Endpoints
# ---------------------------------------------------------------------------
@app.get("/tasks")
def tasks():
    """
    List all tasks and the required action schema for each.
    Satisfies competition requirement: /tasks endpoint.
    """
    return {
        "tasks": [
            {
                "id": "stealth_recon",
                "name": "Task 1: Stealth Recon",
                "description": "Enumerate services without triggering IDS alerts.",
                "action_schema": {
                    "type": "recon",
                    "target_ip": "string",
                    "scan_intensity": "enum: passive | slow | aggressive",
                },
                "grader": "score = (found / total) * penalty_factor",
            },
            {
                "id": "precision_exploit",
                "name": "Task 2: Precision Exploit",
                "description": "Gain a foothold with minimal failed attempts.",
                "action_schema": {
                    "type": "exploit",
                    "target_service": "enum: ssh | http | ftp | smb | rdp",
                    "payload": "string",
                },
                "grader": "score = 1.0 / (1 + failed_attempts)",
            },
            {
                "id": "flag_capture",
                "name": "Task 3: Flag Capture",
                "description": "Exfiltrate the flag from /root/flag.txt.",
                "action_schema": {
                    "type": "exfiltrate",
                    "file_path": "string",
                    "data": "string — the file content",
                },
                "grader": "score = 1.0 if sha256(data) == EXPECTED_HASH else 0.0",
            },
        ]
    }


@app.get("/grader")
def grader(task_id: str = "stealth_recon"):
    """
    Return the current grader score for the given task.
    Score is always in [0.0, 1.0].
    Satisfies competition requirement: /grader endpoint.
    """
    valid = {"stealth_recon", "precision_exploit", "flag_capture"}
    if task_id not in valid:
        raise HTTPException(status_code=422, detail=f"task_id must be one of {valid}")

    score = _env.grader_score(task_id)
    return {
        "task_id": task_id,
        "score": score,
        "range": "[0.0, 1.0]",
    }


@app.post("/baseline")
def baseline():
    """
    Trigger the baseline inference script and return scores for all tasks.
    Satisfies competition requirement: /baseline endpoint.
    """
    try:
        result = subprocess.run(
            [sys.executable, "baseline_inference.py"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=Path(__file__).resolve().parents[3],
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Baseline script failed:\n{result.stderr}",
            )
        # baseline_inference.py prints JSON scores to stdout
        import json
        scores = json.loads(result.stdout.strip().split("\n")[-1])
        return {"status": "success", "scores": scores}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Baseline script timed out.")


# ---------------------------------------------------------------------------
# Dashboard API & React UI
# ---------------------------------------------------------------------------
app.include_router(dashboard_router)

UI_DIR = Path(__file__).resolve().parents[4] / "ui" / "sentinel-core" / "dist"

if UI_DIR.exists():
    # Mount assets first
    if (UI_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(UI_DIR / "assets")), name="assets")

    # Catch-all for React routing (including the root /)
    @app.get("/{full_path:path}")
    def serve_react_app(full_path: str = ""):
        # If the path is empty or it's the root, serve index.html
        if not full_path or full_path == "/":
            return FileResponse(str(UI_DIR / "index.html"))
        
        file_path = UI_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        
        # Fallback to index.html for SPA routing
        return FileResponse(str(UI_DIR / "index.html"))
else:
    @app.get("/")
    def no_ui_fallback():
        return {"status": "ready", "ui": "not_found", "msg": "Run start.py --build-ui"}

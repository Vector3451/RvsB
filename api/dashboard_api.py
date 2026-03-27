"""
Dashboard API v2 — Concurrent match, model detection, rich SSE events.
"""
import asyncio
import json
import sys
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.blue_team import IntelligentBlueAgent
from agents.concurrent_match import run_concurrent_match
from agents.memory import episode_store as mem
from agents.red_team import IntelligentRedAgent

ENV_URL = "http://localhost:7860"
OLLAMA_URL = "http://localhost:11434"

dashboard_router = APIRouter()

# Shared streaming state
_match_events: List[Dict] = []
_match_running = threading.Event()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    episodes: int = 10
    env_url: str = ENV_URL
    model: str = "dolphin-llama3:latest"


class MatchRequest(BaseModel):
    env_url: str = ENV_URL
    red_model: str = "dolphin-llama3:latest"
    blue_model: str = "dolphin-llama3:latest"
    max_steps: int = 40


# ---------------------------------------------------------------------------
# Model detection
# ---------------------------------------------------------------------------
@dashboard_router.get("/api/models")
def list_models():
    """
    Auto-detect available LLM models.
    Returns Ollama models if running, plus a 'none' fallback option.
    """
    models = [{"id": "none", "name": "No LLM (RL only)", "source": "builtin"}]

    # Try Ollama
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if r.ok:
            for m in r.json().get("models", []):
                name = m["name"]
                size_gb = round(m.get("size", 0) / 1e9, 1)
                models.append({
                    "id":     name,
                    "name":   f"{name}  ({size_gb} GB)",
                    "source": "ollama",
                })
    except Exception:
        pass

    return {"models": models, "ollama_running": len(models) > 1}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
@dashboard_router.get("/api/status")
def status():
    return {
        "status": "ok",
        "match_running": _match_running.is_set(),
        "red_episodes": mem.get_recent_episodes("red", 1),
        "blue_episodes": mem.get_recent_episodes("blue", 1),
    }


@dashboard_router.get("/api/history/{role}")
def history(role: str, n: int = 20):
    if role not in ("red", "blue"):
        raise HTTPException(status_code=422, detail="role must be 'red' or 'blue'")
    return {"episodes": mem.get_recent_episodes(role, n)}


@dashboard_router.get("/api/stats/{role}")
def stats(role: str):
    if role not in ("red", "blue"):
        raise HTTPException(status_code=422, detail="role must be 'red' or 'blue'")
    from agents.rl.ppo_agent import PPOPolicy
    policy = PPOPolicy(role=role, save_path=f"agents/rl/{role}_policy.json")
    return {
        "role": role,
        "stats": policy.stats(),
        "reward_history": mem.get_reward_history(role, 50),
    }


# Shared training state
_train_events: List[Dict] = []
_train_running = threading.Event()

# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
def _run_training_thread(role: str, episodes: int, env_url: str, model: str):
    import agents.llm.reasoning_layer as rl_mod
    orig = rl_mod.MODEL
    if model and model != "none":
        rl_mod.MODEL = model

    def emit(e_type: str, data: Any):
        _train_events.append({"type": e_type, "data": data})

    Agent = IntelligentRedAgent if role == "red" else IntelligentBlueAgent
    agent = Agent(env_url=env_url)

    try:
        emit("train_start", {"role": role, "episodes": episodes})
        for i in range(episodes):
            result = agent.run_episode()
            
            # Extract reasoning/strategy safely
            strategy = result.get("strategy_debrief", "")
            
            emit("episode_done", {
                "episode": i + 1,
                "total_episodes": episodes,
                "avg_reward": result["avg_reward"],
                "scores": result["scores"],
                "steps": len(result["timeline"]),
                "exploration_rate": agent.policy.epsilon,
                "strategy": strategy,
                "mistakes": len(result.get("mistakes", [])),
            })
    except Exception as e:
        emit("error", {"message": str(e)})
    finally:
        rl_mod.MODEL = orig
        emit("train_end", {})
        _train_running.clear()


@dashboard_router.post("/api/train/{role}")
def train_start(role: str, req: TrainRequest):
    if role not in ("red", "blue"):
        raise HTTPException(status_code=422, detail="Invalid role")
    if _match_running.is_set() or _train_running.is_set():
        raise HTTPException(status_code=409, detail="Engine busy")
        
    _train_events.clear()
    _train_running.set()
    t = threading.Thread(
        target=_run_training_thread,
        args=(role, req.episodes, req.env_url, req.model),
        daemon=True,
    )
    t.start()
    return {"status": "started"}

@dashboard_router.post("/api/train/stop")
def train_stop():
    _train_running.clear()
    return {"status": "stopped"}

@dashboard_router.get("/api/train/stream")
async def train_stream():
    sent_idx = [0]
    async def generator():
        while _train_running.is_set() or sent_idx[0] < len(_train_events):
            while sent_idx[0] < len(_train_events):
                event = _train_events[sent_idx[0]]
                sent_idx[0] += 1
                yield {"data": json.dumps(event)}
            await asyncio.sleep(0.15)
    return EventSourceResponse(generator())


# ---------------------------------------------------------------------------
# Concurrent Live Match
# ---------------------------------------------------------------------------
def _run_match_thread(env_url: str, red_model: str, blue_model: str, max_steps: int):
    import agents.llm.reasoning_layer as rl_mod
    if red_model and red_model != "none":
        rl_mod.MODEL = red_model  # both agents share the same model switcher

    def emit(event_type: str, data: Any):
        _match_events.append({"type": event_type, "data": data})

    try:
        run_concurrent_match(env_url, red_model, blue_model, max_steps, emit)
    except Exception as e:
        emit("error", {"message": str(e)})
    finally:
        _match_running.clear()


@dashboard_router.post("/api/match/start")
def match_start(req: MatchRequest):
    if _match_running.is_set():
        raise HTTPException(status_code=409, detail="Match already running")
    _match_events.clear()
    _match_running.set()
    t = threading.Thread(
        target=_run_match_thread,
        args=(req.env_url, req.red_model, req.blue_model, req.max_steps),
        daemon=True,
    )
    t.start()
    return {"status": "started"}


@dashboard_router.post("/api/match/stop")
def match_stop():
    _match_running.clear()
    return {"status": "stopped"}


@dashboard_router.get("/api/match/stream")
async def match_stream():
    sent_idx = [0]

    async def generator():
        while _match_running.is_set() or sent_idx[0] < len(_match_events):
            while sent_idx[0] < len(_match_events):
                event = _match_events[sent_idx[0]]
                sent_idx[0] += 1
                yield {"data": json.dumps(event)}
            await asyncio.sleep(0.15)

    return EventSourceResponse(generator())


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
@dashboard_router.get("/api/report/latest")
def latest_report():
    reports = sorted(
        Path("reports").glob("*.html"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not reports:
        raise HTTPException(status_code=404, detail="No reports yet")
    return FileResponse(str(reports[0]), media_type="text/html")

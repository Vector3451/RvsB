"""
BaseAgent — Shared HTTP client loop for both Red and Blue team agents.
All agents inherit from this and implement `decide()`.
"""
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(name)s]  %(message)s",
    datefmt="%H:%M:%S",
)


class BaseAgent(ABC):
    """Abstract base for all RvsB agents.

    Subclasses implement `decide(obs)` to return an action dict,
    and optionally `on_episode_start()` / `on_episode_end()`.
    """

    def __init__(self, name: str, env_url: str, max_steps: int = 60):
        self.name = name
        self.env_url = env_url.rstrip("/")
        self.max_steps = max_steps
        self.session = requests.Session()
        self.log = logging.getLogger(name)

    # ------------------------------------------------------------------
    # API helpers
    # ------------------------------------------------------------------
    def _post(self, path: str, body: Optional[Dict] = None) -> Dict:
        r = self.session.post(f"{self.env_url}{path}", json=body or {}, timeout=10)
        r.raise_for_status()
        return r.json()

    def _get(self, path: str, params: Optional[Dict] = None) -> Dict:
        r = self.session.get(f"{self.env_url}{path}", params=params, timeout=10)
        r.raise_for_status()
        return r.json()

    def reset(self) -> Dict:
        obs = self._post("/reset")
        self.log.info("Episode reset.")
        return obs

    def step(self, action: Dict) -> Dict:
        return self._post("/step", action)

    def get_state(self) -> Dict:
        return self._get("/state")

    def get_grader_score(self, task_id: str) -> float:
        data = self._get("/grader", {"task_id": task_id})
        return data.get("score", 0.0)

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------
    @abstractmethod
    def decide(self, obs: Dict[str, Any]) -> Dict[str, Any]:
        """Given the latest observation, return the next action dict."""

    def on_episode_start(self) -> None:
        """Hook called once after reset, before the loop."""

    def on_episode_end(self, scores: Dict[str, float]) -> None:
        """Hook called with final grader scores after the episode."""

    # ------------------------------------------------------------------
    # Episode loop
    # ------------------------------------------------------------------
    def run_episode(self) -> Dict[str, float]:
        """Run one full episode. Returns grader scores for all 3 tasks."""
        obs = self.reset()
        self.on_episode_start()

        for step in range(self.max_steps):
            if obs.get("done"):
                self.log.info("Episode done at step %d.", step)
                break

            action = self.decide(obs)
            self.log.info("Step %d | action=%s", step + 1, action.get("type"))
            obs = self.step(action)
            reward = obs.get("reward") or 0.0
            self.log.info("         reward=%.3f | alerts=%s | foothold=%s",
                          reward, obs.get("alerts_count", 0),
                          obs.get("foothold_gained", False))
            time.sleep(0.1)   # respectful pacing

        scores = {
            task: self.get_grader_score(task)
            for task in ("stealth_recon", "precision_exploit", "flag_capture")
        }
        self.on_episode_end(scores)
        return scores

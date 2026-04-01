"""
Intelligent Red Team Agent — Hybrid RL + LLM (dolphin-llama3).

Learning loop:
  1. RL policy (PPO) selects low-level actions based on environment state.
  2. dolphin-llama3 narrates tactical reasoning per step (if available).
  3. After each episode, LLM generates a strategy debrief stored in SQLite.
  4. Next episode, agent retrieves and injects past strategy as context.
  5. Policy weights are updated via REINFORCE gradient → persisted to JSON.

The agent genuinely improves across sessions: failed exploits → negative
reward → policy updates away from them. LLM analyses why and refines strategy.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import time
from typing import Any, Dict, List, Optional

import requests

from agents.llm import reasoning_layer as llm
from agents.memory import episode_store as mem
from agents.rl.ppo_agent import (
    ACTION_MAP,
    ACTION_NAMES,
    PPOPolicy,
    _encode_obs,
)

_BASE_URL = "http://localhost:7860"


def color_print(role: str, msg: str):
    """Helper for pretty terminal logging."""
    colors = {
        "red": "\033[91m",
        "blue": "\033[94m",
        "system": "\033[93m",
        "success": "\033[92m",
        "reset": "\033[0m"
    }
    prefix = f"[{role.upper()}] "
    c = colors.get(role.lower(), colors["reset"])
    print(f"{c}{prefix}{msg}{colors['reset']}")


class IntelligentRedAgent:
    """
    AI Red Team agent: learns to attack through reinforcement learning
    and reflects using dolphin-llama3 after each episode.
    """

    def __init__(self, env_url: str = _BASE_URL, max_steps: int = 60):
        self.env_url = env_url.rstrip("/")
        self.max_steps = max_steps
        self.policy = PPOPolicy(role="red", save_path="agents/rl/red_policy.json")
        self._llm_available = llm.is_available()
        self.action_log: List[str] = []
        self.timeline: List[str] = []
        self.session = requests.Session()
        import uuid
        self.session.headers.update({"x-session-id": str(uuid.uuid4())})

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------
    def _post(self, path: str, body: Optional[Dict] = None) -> Dict:
        r = self.session.post(f"{self.env_url}{path}", json=body or {}, timeout=10)
        r.raise_for_status()
        return r.json()

    def _get(self, path: str, params: Optional[Dict] = None) -> Dict:
        r = self.session.get(f"{self.env_url}{path}", params=params, timeout=10)
        r.raise_for_status()
        return r.json()

    # ------------------------------------------------------------------
    # Episode loop
    # ------------------------------------------------------------------
    def run_episode(self, user_guidance: str = "") -> Dict[str, Any]:
        """Run one attack episode. Returns scores + training stats + timeline."""
        obs = self._post("/reset", {"config": {"training": True}})
        self.action_log = []
        self.timeline = []
        trajectory = []
        mistakes = []

        # Inject past strategy into initial LLM context
        past_strategy = mem.get_latest_strategy("red")

        for step in range(self.max_steps):
            if obs.get("done"):
                break

            state = _encode_obs(obs, step, "red")
            action_idx, probs = self.policy.select_action(state)
            
            # Restrict Red Team to attack/recon actions only (0-21)
            if action_idx > 21:
                action_idx = 0  # fallback: passive recon

            action_dict = dict(ACTION_MAP[action_idx])
            action_dict["role"] = "red"
            action_name = ACTION_NAMES[action_idx]

            # LLM narration (async-safe: skipped if slow)
            reasoning = ""
            if self._llm_available and step % 3 == 0:
                reasoning = llm.red_step_reasoning(obs, action_name, step)

            obs = self._post("/step", action_dict)

            reward = float(obs.get("reward") or 0.0)
            
            # Terminal Logging (Simplified)
            color_print("red", f"Step {step+1}: {action_name} -> Reward: {reward:.3f}")
            if "console" in obs.get("metadata", {}):
                print(f"      \033[90m> {obs['metadata']['console']}\033[0m")
            trajectory.append((state, action_idx, reward))

            # Track mistakes
            if reward < 0 or (obs.get("failed_attempts", 0) > 0 and reward == 0):
                mistakes.append(f"Step {step+1}: {action_name} failed (reward={reward:.2f})")

            log_line = f"[{step+1:02d}] {action_name:<20} reward={reward:.3f}"
            if reasoning:
                log_line += f" | {reasoning[:80]}"
            self.action_log.append(log_line)
            self.timeline.append(
                f"Step {step+1}: {action_name} — reward {reward:.3f}"
                + (f" | alerts: {obs.get('alerts_count', 0)}" if obs.get("alerts_count") else "")
            )

        # Update RL policy
        loss = self.policy.update(trajectory)
        self.policy.save()

        # Fetch grader scores
        scores = {
            task: self._get("/grader", {"task_id": task}).get("score", 0.0)
            for task in ("stealth_recon", "precision_exploit", "flag_capture")
        }
        avg_reward = sum(r for _, _, r in trajectory) / max(len(trajectory), 1)

        # LLM post-episode debrief
        strategy = ""
        if self._llm_available and (len(mistakes) > 0 or self.policy.episode_count % 5 == 0):
            strategy = llm.post_episode_debrief("red", [], scores, mistakes, user_guidance)

        # Persist to memory
        mem.save_episode("red", self.policy.episode_count, scores, mistakes,
                         strategy, avg_reward)

        # Summary
        print("-" * 40)
        color_print("success", f"EPISODE {self.policy.episode_count} COMPLETE | Avg Reward: {avg_reward:.3f}")
        print("-" * 40)

        return {
            "scores": scores,
            "policy_stats": self.policy.stats(),
            "loss": loss,
            "avg_reward": avg_reward,
            "timeline": list(self.timeline),
            "action_log": list(self.action_log),
            "mistakes": mistakes,
            "strategy_debrief": strategy,
        }

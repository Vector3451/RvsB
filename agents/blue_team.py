"""
Intelligent Blue Team Agent — Hybrid RL + LLM (dolphin-llama3).

Same learning architecture as Red Team but with reversed reward signals:
  - Blocking attacks → positive reward
  - Alert response speed → bonus reward
  - Failed patches (too late) → negative reward

The Blue Team develops a genuine adaptive detection strategy over time.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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

# Blue Team action mask — defenders don't exploit, they patch and monitor
BLUE_VALID_ACTIONS = {0, 1, 6, 7, 8, 9}  # scan-passive, scan-slow, patch-*, monitor

def _blue_reward(obs: Dict, prev_obs: Dict) -> float:
    """
    Compute a defensive reward based on changes in environment state.
    Blue Team earns reward for reducing attacker progress.
    """
    reward = 0.0
    # Reward for each alert caught early
    new_alerts = obs.get("alerts_count", 0) - prev_obs.get("alerts_count", 0)
    if new_alerts > 0:
        reward += 0.1 * new_alerts
    # Reward from env (patching stops attacker)
    reward += float(obs.get("reward") or 0.0)
    # Penalty if attacker gained foothold this step
    if obs.get("foothold_gained") and not prev_obs.get("foothold_gained"):
        reward -= 0.5
    # Penalty if flag captured
    if obs.get("flag_found"):
        reward -= 1.0
    return round(reward, 3)


class IntelligentBlueAgent:
    """
    AI Blue Team agent: learns to defend through reinforcement learning
    and reflects using dolphin-llama3 to improve detection strategies.
    """

    def __init__(self, env_url: str = _BASE_URL, max_steps: int = 60):
        self.env_url = env_url.rstrip("/")
        self.max_steps = max_steps
        self.policy = PPOPolicy(role="blue", save_path="agents/rl/blue_policy.json",
                                epsilon=0.4)
        self._llm_available = llm.is_available()
        self.action_log: List[str] = []
        self.session = requests.Session()

    def _post(self, path: str, body: Optional[Dict] = None) -> Dict:
        r = self.session.post(f"{self.env_url}{path}", json=body or {}, timeout=10)
        r.raise_for_status()
        return r.json()

    def _get(self, path: str, params: Optional[Dict] = None) -> Dict:
        r = self.session.get(f"{self.env_url}{path}", params=params, timeout=10)
        r.raise_for_status()
        return r.json()

    def run_episode(self, user_guidance: str = "") -> Dict[str, Any]:
        """Run one defence episode. Returns own stats (not competing scores)."""
        obs = self._post("/reset")
        self.action_log = []
        trajectory = []
        mistakes = []
        prev_obs = dict(obs)

        for step in range(self.max_steps):
            if obs.get("done"):
                break

            state = _encode_obs(obs, step, "blue")
            action_idx, probs = self.policy.select_action(state)

            # Restrict Blue Team to defensive actions only
            if action_idx not in BLUE_VALID_ACTIONS:
                action_idx = 9  # fallback: monitor

            action_dict = dict(ACTION_MAP[action_idx])
            action_name = ACTION_NAMES[action_idx]

            reasoning = ""
            if self._llm_available and step % 4 == 0:
                reasoning = llm.blue_step_reasoning(obs, action_name, step)

            obs = self._post("/step", action_dict)
            reward = _blue_reward(obs, prev_obs)

            if reward < 0:
                mistakes.append(f"Step {step+1}: {action_name} left attacker unchecked (reward={reward:.2f})")

            trajectory.append((state, action_idx, reward))
            log_line = f"[{step+1:02d}] {action_name:<20} defence_reward={reward:.3f}"
            if reasoning:
                log_line += f" | {reasoning[:80]}"
            self.action_log.append(log_line)
            prev_obs = dict(obs)

        loss = self.policy.update(trajectory)
        self.policy.save()

        scores = {
            task: self._get("/grader", {"task_id": task}).get("score", 0.0)
            for task in ("stealth_recon", "precision_exploit", "flag_capture")
        }
        avg_reward = sum(r for _, _, r in trajectory) / max(len(trajectory), 1)

        strategy = ""
        if self._llm_available and len(mistakes) > 0:
            strategy = llm.post_episode_debrief("blue", [], scores, mistakes, user_guidance)

        mem.save_episode("blue", self.policy.episode_count, scores, mistakes,
                         strategy, avg_reward)

        return {
            "scores": scores,
            "policy_stats": self.policy.stats(),
            "loss": loss,
            "avg_reward": avg_reward,
            "action_log": list(self.action_log),
            "timeline": list(self.action_log),  # Blue doesn't use a separate timeline array right now, so action_log works
            "mistakes": mistakes,
            "strategy_debrief": strategy,
        }


"""
PPO-style Policy Agent (NumPy-based, Python 3.14 compatible).

Uses a linear policy with softmax action selection and REINFORCE-style
gradient updates (simplified policy gradient — no PyTorch required).

State vector (9 features):
  [found_services/5, alert_count/10, foothold, flag_found,
   failed_attempts/10, step/60, blue_patched/5, time_remaining/60, phase_enc]

Action space (10 discrete actions):
  0: scan-passive   1: scan-slow      2: scan-aggressive
  3: exploit-http   4: exploit-ssh    5: exploit-ftp
  6: patch-http     7: patch-ssh      8: patch-ftp
  9: monitor
"""
import json
import math
import os
import random
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

STATE_DIM = 9
ACTION_DIM = 10
ACTION_NAMES = [
    "scan-passive", "scan-slow", "scan-aggressive",
    "exploit-http", "exploit-ssh", "exploit-ftp",
    "patch-http", "patch-ssh", "patch-ftp",
    "monitor",
]

# Maps action index → environment action dict
ACTION_MAP = {
    0: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "passive"},
    1: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},
    2: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "aggressive"},
    3: {"type": "exploit", "target_service": "http", "payload": "sqli: ' OR 1=1 --"},
    4: {"type": "exploit", "target_service": "ssh",  "payload": "brute: admin/admin"},
    5: {"type": "exploit", "target_service": "ftp",  "payload": "anon_login: USER anonymous"},
    6: {"type": "exploit", "target_service": "http", "payload": "PATCH:http"},
    7: {"type": "exploit", "target_service": "ssh",  "payload": "PATCH:ssh"},
    8: {"type": "exploit", "target_service": "ftp",  "payload": "PATCH:ftp"},
    9: {"type": "recon",   "target_ip": "10.0.0.1", "scan_intensity": "passive"},
}


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _encode_obs(obs: Dict, step: int, role: str) -> np.ndarray:
    """Convert env observation dict to a fixed-length feature vector."""
    open_svc = obs.get("open_services", [])
    patched  = obs.get("patched_services", [])
    return np.array([
        len(open_svc) / 5.0,
        min(obs.get("alerts_count", 0), 10) / 10.0,
        float(obs.get("foothold_gained", False)),
        float(obs.get("flag_found", False)),
        min(obs.get("failed_attempts", 0), 10) / 10.0,
        step / 60.0,
        len(patched) / 5.0,
        obs.get("time_remaining", 60) / 60.0,
        1.0 if role == "red" else 0.0,
    ], dtype=np.float32)


class PPOPolicy:
    """
    Linear softmax policy with REINFORCE update (policy gradient).
    Learns which actions lead to higher rewards over episodes.
    """

    def __init__(self, role: str, lr: float = 0.05, gamma: float = 0.95,
                 epsilon: float = 0.3, save_path: Optional[str] = None):
        self.role = role
        self.lr = lr
        self.gamma = gamma
        self.epsilon = epsilon   # exploration rate

        # Linear weight matrix: W[action, state_dim]
        self.W = np.zeros((ACTION_DIM, STATE_DIM), dtype=np.float32)
        self.episode_count = 0
        self.total_reward = 0.0
        self.reward_history: List[float] = []

        self.save_path = save_path or f"agents/rl/{role}_policy.json"
        self.load()

    # ------------------------------------------------------------------
    # Action selection
    # ------------------------------------------------------------------
    def logits(self, state: np.ndarray) -> np.ndarray:
        return self.W @ state

    def action_probs(self, state: np.ndarray) -> np.ndarray:
        return _softmax(self.logits(state))

    def select_action(self, state: np.ndarray) -> Tuple[int, np.ndarray]:
        """Epsilon-greedy with policy softmax."""
        probs = self.action_probs(state)
        # Decay exploration over episodes
        eps = max(0.05, self.epsilon * math.exp(-self.episode_count / 200))
        if random.random() < eps:
            idx = random.randrange(ACTION_DIM)
        else:
            idx = int(np.random.choice(ACTION_DIM, p=probs))
        return idx, probs

    # ------------------------------------------------------------------
    # REINFORCE update
    # ------------------------------------------------------------------
    def update(self, trajectory: List[Tuple[np.ndarray, int, float]]) -> float:
        """
        trajectory: list of (state, action, reward) tuples for one episode.
        Returns mean loss (for logging).
        """
        # Compute discounted returns
        G = 0.0
        returns = []
        for _, _, r in reversed(trajectory):
            G = r + self.gamma * G
            returns.insert(0, G)

        returns = np.array(returns, dtype=np.float32)
        # Normalise returns for stable training
        if returns.std() > 1e-6:
            returns = (returns - returns.mean()) / (returns.std() + 1e-8)

        loss = 0.0
        for (state, action, _), G_t in zip(trajectory, returns):
            probs = self.action_probs(state)
            log_prob = math.log(probs[action] + 1e-8)
            # Policy gradient: ∇ log π(a|s) * G
            grad = np.zeros_like(probs)
            grad[action] = 1.0
            grad -= probs
            # Update weight row for each action
            self.W += self.lr * G_t * np.outer(grad, state)
            loss += -log_prob * G_t

        self.episode_count += 1
        ep_reward = sum(r for _, _, r in trajectory)
        self.total_reward += ep_reward
        self.reward_history.append(ep_reward)
        return loss / max(len(trajectory), 1)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def save(self) -> None:
        Path(self.save_path).parent.mkdir(parents=True, exist_ok=True)
        data = {
            "role": self.role,
            "W": self.W.tolist(),
            "episode_count": self.episode_count,
            "total_reward": self.total_reward,
            "reward_history": self.reward_history[-500:],  # keep last 500
        }
        with open(self.save_path, "w") as f:
            json.dump(data, f)

    def load(self) -> bool:
        if not os.path.exists(self.save_path):
            return False
        try:
            with open(self.save_path) as f:
                data = json.load(f)
            self.W = np.array(data["W"], dtype=np.float32)
            self.episode_count = data.get("episode_count", 0)
            self.total_reward = data.get("total_reward", 0.0)
            self.reward_history = data.get("reward_history", [])
            return True
        except Exception:
            return False

    def stats(self) -> Dict:
        hist = self.reward_history[-20:] if self.reward_history else [0]
        return {
            "episodes": self.episode_count,
            "total_reward": round(self.total_reward, 2),
            "avg_reward_last20": round(sum(hist) / len(hist), 3),
            "exploration_rate": round(
                max(0.05, self.epsilon * math.exp(-self.episode_count / 200)), 3
            ),
        }

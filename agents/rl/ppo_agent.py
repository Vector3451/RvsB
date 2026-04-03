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
ACTION_DIM = 40
ACTION_NAMES = [
    # Recon (0-2)
    "scan-passive", "scan-slow", "scan-aggressive",
    # Exploits (3-16)
    "exploit-http-sqli", "exploit-http-rce", 
    "exploit-ssh-brute", "exploit-ssh-keyleak",
    "exploit-ftp-anon", "exploit-ftp-bounce",
    "exploit-smb-eternalblue", "exploit-smb-guess",
    "exploit-rdp-brute", "exploit-rdp-bluekeep",
    "exploit-sql-inject", "exploit-sql-creds",
    "exploit-nfs-mount", "exploit-nfs-suid",
    # Post-Exploitation / Exfil (17-21)
    "exfil-passwd", "exfil-sam", "exfil-db",
    "backdoor-ssh", "clear-logs",
    # Blue Defense (Patching) (22-28)
    "patch-http", "patch-ssh", "patch-ftp",
    "patch-smb", "patch-rdp", "patch-sql", "patch-nfs",
    # Blue Active Defense (29-32)
    "defend-drop-conn", "defend-honeypot", "defend-restart", "defend-isolate",
    # Blue Monitoring (33-39)
    "monitor-netstat", "monitor-logs-http", "monitor-logs-ssh",
    "monitor-logs-ftp", "monitor-logs-smb", "monitor-logs-rdp", "monitor-logs-sql"
]

# Maps action index → environment action dict
ACTION_MAP = {
    # Recon
    0: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "passive"},
    1: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},
    2: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "aggressive"},
    
    # Exploits
    3: {"type": "exploit", "target_service": "http", "payload": "sqli"},
    4: {"type": "exploit", "target_service": "http", "payload": "rce"},
    5: {"type": "exploit", "target_service": "ssh",  "payload": "bruteforce"},
    6: {"type": "exploit", "target_service": "ssh",  "payload": "keyleak"},
    7: {"type": "exploit", "target_service": "ftp",  "payload": "anonymous"},
    8: {"type": "exploit", "target_service": "ftp",  "payload": "bounce"},
    9: {"type": "exploit", "target_service": "smb",  "payload": "eternalblue"},
    10: {"type": "exploit", "target_service": "smb", "payload": "guess"},
    11: {"type": "exploit", "target_service": "rdp", "payload": "bruteforce"},
    12: {"type": "exploit", "target_service": "rdp", "payload": "bluekeep"},
    13: {"type": "exploit", "target_service": "sql", "payload": "sqli"},
    14: {"type": "exploit", "target_service": "sql", "payload": "defaultcreds"},
    15: {"type": "exploit", "target_service": "nfs", "payload": "mount"},
    16: {"type": "exploit", "target_service": "nfs", "payload": "suid"},
    
    # Post-Exploitation
    17: {"type": "exfiltrate", "target_service": "core", "payload": "passwd"},
    18: {"type": "exfiltrate", "target_service": "core", "payload": "sam"},
    19: {"type": "exfiltrate", "target_service": "core", "payload": "db"},
    20: {"type": "exfiltrate", "target_service": "core", "payload": "backdoor"},
    21: {"type": "exfiltrate", "target_service": "core", "payload": "clearlogs"},
    
    # Blue Patching
    22: {"type": "exploit", "target_service": "http", "payload": "patch"},
    23: {"type": "exploit", "target_service": "ssh",  "payload": "patch"},
    24: {"type": "exploit", "target_service": "ftp",  "payload": "patch"},
    25: {"type": "exploit", "target_service": "smb",  "payload": "patch"},
    26: {"type": "exploit", "target_service": "rdp",  "payload": "patch"},
    27: {"type": "exploit", "target_service": "sql",  "payload": "patch"},
    28: {"type": "exploit", "target_service": "nfs",  "payload": "patch"},
    
    # Blue Active Defense
    29: {"type": "exploit", "target_service": "core", "payload": "dropconn"},
    30: {"type": "exploit", "target_service": "core", "payload": "honeypot"},
    31: {"type": "exploit", "target_service": "core", "payload": "restart"},
    32: {"type": "exploit", "target_service": "core", "payload": "isolate"},
    
    # Blue Monitoring
    33: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "passive"}, # netstat alias
    34: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},    # logs-http
    35: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},    # logs-ssh
    36: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},    # logs-ftp
    37: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},    # logs-smb
    38: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},    # logs-rdp
    39: {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"},    # logs-sql
}


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _encode_obs(obs: Dict, step: int, role: str) -> np.ndarray:
    """Convert env observation dict to a fixed-length feature vector."""
    open_svc = obs.get("open_services", [])
    patched  = obs.get("patched_services", [])
    total    = float(obs.get("total_nodes", 5))
    
    return np.array([
        len(open_svc) / total,
        min(obs.get("alerts_count", 0), 10) / 10.0,
        float(obs.get("foothold_gained", False)),
        float(obs.get("flag_found", False)),
        min(obs.get("failed_attempts", 0), 10) / 10.0,
        step / 60.0,
        len(patched) / total,
        obs.get("time_remaining", 60) / 60.0,
        1.0 if role == "red" else 0.0,
    ], dtype=np.float32)


class PPOPolicy:
    """
    Linear softmax policy with REINFORCE update (policy gradient).
    Learns which actions lead to higher rewards over episodes.
    """

    def __init__(self, role: str, lr: float = 0.05, gamma: float = 0.95,
                 epsilon: float = 0.3, save_path: Optional[str] = None, seed: Optional[int] = None):
        self.role = role
        self.lr = lr
        self.gamma = gamma
        self.epsilon = epsilon   # exploration rate
        
        self.rng = random.Random(seed)
        self.np_rng = np.random.RandomState(seed)

        # Linear weight matrix: W[action, state_dim]
        self.W = np.zeros((ACTION_DIM, STATE_DIM), dtype=np.float32)
        self.episode_count = 0
        self.total_reward = 0.0
        self.reward_history: List[float] = []

        self.save_path = save_path or f"data/{self.role}_policy.json"
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
        if self.rng.random() < eps:
            idx = self.rng.randrange(ACTION_DIM)
        else:
            idx = int(self.np_rng.choice(ACTION_DIM, p=probs))
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
            loaded_W = np.array(data["W"], dtype=np.float32)
            # Validate dimensions — if saved from an old action space, discard
            if loaded_W.shape != (ACTION_DIM, STATE_DIM):
                print(f"[PPO] Stale policy ({loaded_W.shape}) vs expected ({ACTION_DIM},{STATE_DIM}) — resetting.")
                return False
            self.W = loaded_W
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

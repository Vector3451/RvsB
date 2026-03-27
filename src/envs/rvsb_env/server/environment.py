"""
RvsB Core Simulation Logic.
Manages the simulated network, flag, and scoring for all 3 tasks.
"""
import hashlib
import random
import uuid
from typing import List

from core.env_server import Environment
from envs.rvsb_env.models import (
    ExfiltrateAction,
    ExploitAction,
    ReconAction,
    RvsBAction,
    RvsBObservation,
    RvsBState,
)

# The "real" flag — only the environment knows this.
_FLAG_SECRET = "flag{r3d_t34m_w1ns_" + uuid.uuid4().hex[:8] + "}"
_FLAG_HASH = hashlib.sha256(_FLAG_SECRET.encode()).hexdigest()

_ALL_SERVICES = ["ssh", "http", "ftp", "smb", "rdp"]
_ALERT_THRESHOLDS = {"passive": 0, "slow": 1, "aggressive": 3}


class RvsBEnvironment(Environment):
    """
    Simulates a target network with:
      - 5 discoverable services
      - 1 exploitable service (http with SQLi)
      - A hidden flag file at /root/flag.txt
      - An IDS that triggers based on scan intensity
    """

    def __init__(self):
        self._state = RvsBState()
        self._flag_accessible = False
        self._foothold = False
        self._found_services: List[str] = []
        self._failed_attempts = 0
        self._alerts = 0
        self._patched: List[str] = []

    # ------------------------------------------------------------------
    # OpenEnv required methods
    # ------------------------------------------------------------------
    def reset(self) -> RvsBObservation:
        self._state = RvsBState(
            episode_id=str(uuid.uuid4()),
            step_count=0,
            current_task="stealth_recon",
            phase="recon",
            red_score=0.0,
            blue_score=0.0,
            time_remaining=60,
            total_alerts=0,
            total_services=len(_ALL_SERVICES),
            found_services=0,
        )
        self._flag_accessible = False
        self._foothold = False
        self._found_services = []
        self._failed_attempts = 0
        self._alerts = 0
        self._patched = []
        return RvsBObservation(
            done=False,
            reward=0.0,
            open_services=[],
            alert_triggered=False,
            alerts_count=0,
            foothold_gained=False,
            failed_attempts=0,
            flag_found=False,
            flag_content="",
            patched_services=[],
            intrusion_detected=False,
        )

    def step(self, action: RvsBAction) -> RvsBObservation:
        self._state.step_count += 1
        self._state.time_remaining -= 1

        if self._state.time_remaining <= 0:
            return self._timeout_obs()

        if isinstance(action, ReconAction):
            return self._handle_recon(action)
        if isinstance(action, ExploitAction):
            return self._handle_exploit(action)
        if isinstance(action, ExfiltrateAction):
            return self._handle_exfiltrate(action)

        return RvsBObservation(done=False, reward=0.0)

    @property
    def state(self) -> RvsBState:
        return self._state

    # ------------------------------------------------------------------
    # Task handlers
    # ------------------------------------------------------------------
    def _handle_recon(self, action: ReconAction) -> RvsBObservation:
        threshold = _ALERT_THRESHOLDS.get(action.scan_intensity, 3)
        alert = action.scan_intensity == "aggressive"
        if alert:
            self._alerts += threshold
            self._state.total_alerts += threshold

        # Find 1–3 services depending on intensity
        scale = {"passive": 1, "slow": 2, "aggressive": 5}
        found = random.sample(
            [s for s in _ALL_SERVICES if s not in self._found_services],
            k=min(scale.get(action.scan_intensity, 1),
                  len(_ALL_SERVICES) - len(self._found_services))
        )
        self._found_services.extend(found)
        self._state.found_services = len(self._found_services)

        # Grader: (found / total) * penalty if alerts
        penalty = max(0.2, 1.0 - 0.1 * self._alerts)
        score = (len(self._found_services) / len(_ALL_SERVICES)) * penalty
        self._state.red_score = max(self._state.red_score, score)

        return RvsBObservation(
            done=len(self._found_services) == len(_ALL_SERVICES),
            reward=round(score, 3),
            open_services=list(self._found_services),
            alert_triggered=alert,
            alerts_count=self._alerts,
        )

    def _handle_exploit(self, action: ExploitAction) -> RvsBObservation:
        if action.target_service in self._patched:
            self._failed_attempts += 1
            return RvsBObservation(
                done=False, reward=0.0,
                foothold_gained=False,
                failed_attempts=self._failed_attempts,
                metadata={"error": "service_patched"},
            )

        # http is exploitable; others require credential brute-force (noisy)
        success = (action.target_service == "http" and
                   "sqli" in action.payload.lower())
        if not success:
            self._failed_attempts += 1
            self._alerts += 1
            self._state.total_alerts += 1

        # Grader: 1 / (1 + failed_attempts)
        score = 1.0 / (1 + self._failed_attempts)
        if success:
            self._foothold = True
            self._flag_accessible = True
            self._state.phase = "exfiltrate"

        self._state.red_score = max(self._state.red_score, score if success else 0.0)
        return RvsBObservation(
            done=False,
            reward=round(score, 3) if success else 0.0,
            foothold_gained=self._foothold,
            failed_attempts=self._failed_attempts,
            alert_triggered=not success,
            alerts_count=self._alerts,
        )

    def _handle_exfiltrate(self, action: ExfiltrateAction) -> RvsBObservation:
        if not self._flag_accessible:
            return RvsBObservation(
                done=False, reward=0.0,
                metadata={"error": "no_foothold — gain access first"},
            )

        actual_hash = hashlib.sha256(action.data.encode()).hexdigest()
        success = actual_hash == _FLAG_HASH

        # Reveal partial flag on wrong guess so agents can iterate
        hint = _FLAG_SECRET[:8] + "****" if not success else ""

        score = 1.0 if success else 0.0
        self._state.red_score = max(self._state.red_score, score)

        return RvsBObservation(
            done=True,
            reward=score,
            flag_found=success,
            flag_content=_FLAG_SECRET if success else hint,
            metadata={"expected_hash": _FLAG_HASH if not success else ""},
        )

    def _timeout_obs(self) -> RvsBObservation:
        return RvsBObservation(
            done=True, reward=0.0,
            metadata={"error": "episode_timeout"},
        )

    # ------------------------------------------------------------------
    # Grader helpers (used by /grader endpoint)
    # ------------------------------------------------------------------
    def grader_score(self, task_id: str) -> float:
        if task_id == "stealth_recon":
            if not self._found_services:
                return 0.0
            penalty = max(0.2, 1.0 - 0.1 * self._alerts)
            return round((len(self._found_services) / len(_ALL_SERVICES)) * penalty, 3)
        if task_id == "precision_exploit":
            return round(1.0 / (1 + self._failed_attempts), 3) if self._foothold else 0.0
        if task_id == "flag_capture":
            return 1.0 if self._flag_accessible and any(
                hashlib.sha256(c.encode()).hexdigest() == _FLAG_HASH
                for c in [_FLAG_SECRET]
            ) else 0.0
        return 0.0

    @staticmethod
    def flag_hash() -> str:
        return _FLAG_HASH

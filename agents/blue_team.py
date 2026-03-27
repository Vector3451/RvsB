"""
Blue Team Agent — Defensive defender following a Monitor -> Patch -> Harden cycle.

Strategy:
  Phase 1 (MONITOR):  Poll /state every step. Track total_alerts and found_services.
  Phase 2 (PATCH):    If alerts exceed threshold, patch the most likely targeted service.
  Phase 3 (HARDEN):   Rotate through patching all discovered services proactively.

Blue Team uses the /state endpoint (not /step) to observe the battle, then
submits "patch" actions disguised as exploit actions with a special payload.
The environment treats exploit actions on already-patched services as no-ops,
so patching is encoded as: exploit with payload "PATCH:<service>".
"""
import time
from typing import Any, Dict, List

from agents.base_agent import BaseAgent

# Alert threshold that triggers emergency patching
_ALERT_THRESHOLD = 2

# Priority list: most likely targets first
_PATCH_PRIORITY = ["http", "ssh", "ftp", "smb", "rdp"]


class BlueTeamAgent(BaseAgent):
    """Defensive monitoring and patching agent."""

    def __init__(self, env_url: str, max_steps: int = 60):
        super().__init__("BLUE-TEAM", env_url, max_steps)
        self._phase = "monitor"
        self._patched: List[str] = []
        self._prev_alerts = 0
        self._patch_idx = 0

    def on_episode_start(self) -> None:
        self._phase = "monitor"
        self._patched = []
        self._prev_alerts = 0
        self._patch_idx = 0
        self.log.info("=== BLUE TEAM: Episode started. Phase: MONITOR ===")

    def decide(self, obs: Dict[str, Any]) -> Dict[str, Any]:
        current_alerts = obs.get("alerts_count", 0)
        open_services = obs.get("open_services", [])
        intrusion = obs.get("intrusion_detected", False)
        foothold = obs.get("foothold_gained", False)

        # Emergency response: intrusion or sudden alert spike
        new_alerts = current_alerts - self._prev_alerts
        self._prev_alerts = current_alerts

        if foothold or intrusion or new_alerts >= _ALERT_THRESHOLD:
            self.log.info(
                "ALERT SPIKE detected (new=%d, total=%d). Switching to PATCH.",
                new_alerts, current_alerts,
            )
            self._phase = "patch"

        # ── Phase 1: MONITOR ──────────────────────────────────────────
        if self._phase == "monitor":
            # Passive recon on own network to map services before Red Team does
            return {
                "type": "recon",
                "target_ip": "10.0.0.1",
                "scan_intensity": "passive",
            }

        # ── Phase 2: PATCH ────────────────────────────────────────────
        if self._phase == "patch":
            # Patch HTTP first (primary attack vector), then others
            for svc in _PATCH_PRIORITY:
                if svc not in self._patched and svc in open_services:
                    self.log.info("Patching service: %s", svc)
                    self._patched.append(svc)
                    # Signal patch remaining after this service
                    if len(self._patched) >= len(open_services):
                        self._phase = "harden"
                    return {
                        "type": "exploit",
                        "target_service": svc,
                        "payload": f"PATCH:{svc}",   # env treats this as a patch
                    }
            # Nothing left to patch — move to hardening
            self._phase = "harden"

        # ── Phase 3: HARDEN ───────────────────────────────────────────
        # Cycle through all services, repatching periodically
        if _PATCH_PRIORITY:
            svc = _PATCH_PRIORITY[self._patch_idx % len(_PATCH_PRIORITY)]
            self._patch_idx += 1
            return {
                "type": "exploit",
                "target_service": svc,
                "payload": f"PATCH:{svc}",
            }

        # Fallback: keep monitoring
        return {
            "type": "recon",
            "target_ip": "10.0.0.1",
            "scan_intensity": "passive",
        }

    def on_episode_end(self, scores: Dict[str, float]) -> None:
        self.log.info("=== BLUE TEAM: Episode complete ===")
        self.log.info("Services patched this episode: %s", self._patched)
        for task, score in scores.items():
            # Blue Team wants LOW Red Team scores = good defense
            defence = round(1.0 - score, 3)
            self.log.info("  %-22s  defence=%.3f  (red=%.3f)", task, defence, score)

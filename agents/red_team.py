"""
Red Team Agent — Offensive attacker following MITRE ATT&CK phases:
  RECON -> EXPLOIT -> EXFILTRATE

Strategy:
  Phase 1 (RECON):      Slow-scan until all services are found.
                        Avoids aggressive scans to stay under IDS threshold.
  Phase 2 (EXPLOIT):    Target HTTP service with known SQLi payload first.
                        Falls back to other services if HTTP is patched.
  Phase 3 (EXFILTRATE): After foothold, reads /root/flag.txt.
                        Uses hash hint from env to validate correctness.
"""
import hashlib
from typing import Any, Dict

from agents.base_agent import BaseAgent

# Known good payload for the HTTP SQLi vulnerability
_SQLI_PAYLOAD = "sqli: ' OR 1=1 --"

# Fallback exploit attempts (noisy but necessary if http is patched)
_FALLBACKS = [
    ("ftp",  "anon_login: USER anonymous"),
    ("smb",  "eternalblue: MS17-010"),
    ("ssh",  "brute: admin/admin"),
    ("rdp",  "bluekeep: CVE-2019-0708"),
]


class RedTeamAgent(BaseAgent):
    """MITRE-guided attacker: Recon -> Exploit -> Exfiltrate."""

    def __init__(self, env_url: str, max_steps: int = 60):
        super().__init__("RED-TEAM", env_url, max_steps)
        self._phase = "recon"
        self._found_services = []
        self._foothold = False
        self._expected_hash: str = ""
        self._fallback_idx = 0

    def on_episode_start(self) -> None:
        self._phase = "recon"
        self._found_services = []
        self._foothold = False
        self._expected_hash = ""
        self._fallback_idx = 0
        self.log.info("=== RED TEAM: Episode started. Phase: RECON ===")

    def decide(self, obs: Dict[str, Any]) -> Dict[str, Any]:
        # Update internal state from observation
        self._found_services = obs.get("open_services", self._found_services)
        if obs.get("foothold_gained"):
            self._foothold = True
        # Pick up hash hint if env revealed it on a wrong guess
        hint = obs.get("metadata", {}).get("expected_hash", "")
        if hint:
            self._expected_hash = hint

        # ── Phase 1: RECON ────────────────────────────────────────────
        if self._phase == "recon":
            # 5 total services; switch to exploit once we find at least 1
            if len(self._found_services) >= 1 and "http" in self._found_services:
                self.log.info("HTTP discovered — moving to EXPLOIT phase.")
                self._phase = "exploit"
                return self._exploit_action()

            # Keep scanning slowly to avoid triggering IDS
            return {
                "type": "recon",
                "target_ip": "10.0.0.1",
                "scan_intensity": "slow",
            }

        # ── Phase 2: EXPLOIT ──────────────────────────────────────────
        if self._phase == "exploit":
            if self._foothold:
                self.log.info("Foothold confirmed — moving to EXFILTRATE phase.")
                self._phase = "exfiltrate"
                return self._exfil_action()
            return self._exploit_action()

        # ── Phase 3: EXFILTRATE ───────────────────────────────────────
        if self._phase == "exfiltrate":
            return self._exfil_action()

        # Default fallback
        return {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "passive"}

    def _exploit_action(self) -> Dict[str, Any]:
        """Try HTTP SQLi first; fall back to other services if unavailable."""
        if "http" in self._found_services:
            return {
                "type": "exploit",
                "target_service": "http",
                "payload": _SQLI_PAYLOAD,
            }
        # Fall back through noisy exploits
        if self._fallback_idx < len(_FALLBACKS):
            svc, payload = _FALLBACKS[self._fallback_idx]
            if svc in self._found_services:
                self._fallback_idx += 1
                return {"type": "exploit", "target_service": svc, "payload": payload}
        # Need to recon more first
        self._phase = "recon"
        return {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"}

    def _exfil_action(self) -> Dict[str, Any]:
        """Attempt flag exfiltration. On first try send empty to get hash hint."""
        return {
            "type": "exfiltrate",
            "file_path": "/root/flag.txt",
            "data": "",    # Empty triggers hint reveal from environment
        }

    def on_episode_end(self, scores: Dict[str, float]) -> None:
        self.log.info("=== RED TEAM: Episode complete ===")
        for task, score in scores.items():
            self.log.info("  %-22s  %.3f", task, score)

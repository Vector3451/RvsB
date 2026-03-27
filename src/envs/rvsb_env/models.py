"""
RvsB Environment — Typed contracts (Action, Observation, State).
These Pydantic models form the OpenEnv spec-compliant API contract.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from core.env_server import Action, Observation, State


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
@dataclass
class ReconAction(Action):
    """Passive or active service discovery on the simulated network."""
    type: str = "recon"
    target_ip: str = "10.0.0.1"
    scan_intensity: str = "passive"   # 'passive' | 'slow' | 'aggressive'


@dataclass
class ExploitAction(Action):
    """Attempt to exploit a known vulnerability on a target service."""
    type: str = "exploit"
    target_service: str = "ssh"       # 'ssh' | 'http' | 'ftp'
    payload: str = ""


@dataclass
class ExfiltrateAction(Action):
    """Read and exfiltrate a file from the target node."""
    type: str = "exfiltrate"
    file_path: str = "/root/flag.txt"
    data: str = ""                    # Agent fills this after gaining access


# Union type for dispatcher
RvsBAction = ReconAction | ExploitAction | ExfiltrateAction


# ---------------------------------------------------------------------------
# Observation
# ---------------------------------------------------------------------------
@dataclass
class RvsBObservation(Observation):
    """What the agent receives after each step."""
    done: bool = False
    reward: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Network state
    open_services: List[str] = field(default_factory=list)
    alert_triggered: bool = False
    alerts_count: int = 0

    # Exploit state
    foothold_gained: bool = False
    failed_attempts: int = 0

    # Flag state
    flag_found: bool = False
    flag_content: str = ""

    # Blue Team info
    patched_services: List[str] = field(default_factory=list)
    intrusion_detected: bool = False


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
@dataclass
class RvsBState(State):
    """Episode-level metadata returned by /state."""
    episode_id: Optional[str] = None
    step_count: int = 0
    current_task: str = "stealth_recon"
    phase: str = "recon"             # 'recon' | 'exploit' | 'exfiltrate'
    red_score: float = 0.0
    blue_score: float = 0.0
    time_remaining: int = 60         # steps remaining before timeout
    total_alerts: int = 0
    total_services: int = 5
    found_services: int = 0

"""
RvsB Environment — Typed contracts (Action, Observation, State).
These Pydantic models form the OpenEnv spec-compliant API contract.
"""
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

class ReconAction(BaseModel):
    """Passive or active service discovery on the simulated network."""
    type: str = "recon"
    target_ip: str = "10.0.0.1"
    scan_intensity: str = "passive"   # 'passive' | 'slow' | 'aggressive'
    role: str = "red"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExploitAction(BaseModel):
    """Attempt to exploit a known vulnerability on a target service."""
    type: str = "exploit"
    target_service: str = "ssh"       # 'ssh' | 'http' | 'ftp'
    payload: str = ""
    role: str = "red"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExfiltrateAction(BaseModel):
    """Read and exfiltrate a file from the target node."""
    type: str = "exfiltrate"
    target_service: str = "core"
    payload: str = ""
    file_path: str = "/root/sensitive_data.txt"
    data: str = ""
    role: str = "red"
    metadata: Dict[str, Any] = Field(default_factory=dict)


# Union type for dispatcher
RvsBAction = Union[ReconAction, ExploitAction, ExfiltrateAction]


# ---------------------------------------------------------------------------
# Observation
# ---------------------------------------------------------------------------

class RvsBObservation(BaseModel):
    """What the agent receives after each step."""
    done: bool = False
    reward: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    # Network state
    open_services: List[str] = Field(default_factory=list)
    alert_triggered: bool = False
    alerts_count: int = 0

    # Exploit state
    foothold_gained: bool = False
    attacker_at: Optional[str] = None
    failed_attempts: int = 0

    # Flag state
    flag_found: bool = False
    flag_content: str = ""

    # Blue Team info
    patched_services: List[str] = Field(default_factory=list)
    intrusion_detected: bool = False
    total_nodes: int = 5


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class RvsBState(BaseModel):
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

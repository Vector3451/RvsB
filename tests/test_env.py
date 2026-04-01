"""
test_env.py — Unit tests for the Sentinel Core OpenEnv environment.
Run: python -m pytest tests/ -v
"""
import hashlib
import json
import sys
from pathlib import Path

import pytest

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from envs.rvsb_env.models import (
    ReconAction,
    ExploitAction,
    ExfiltrateAction,
    RvsBObservation,
    RvsBState,
)


# ---------------------------------------------------------------------------
# Model tests (Pydantic validation)
# ---------------------------------------------------------------------------

class TestPydanticModels:
    def test_recon_action_defaults(self):
        a = ReconAction()
        assert a.type == "recon"
        assert a.scan_intensity == "passive"
        assert a.role == "red"

    def test_exploit_action_fields(self):
        a = ExploitAction(target_service="http", payload="sqli", role="red")
        assert a.target_service == "http"
        assert a.payload == "sqli"

    def test_exfiltrate_action_fields(self):
        a = ExfiltrateAction(file_path="/root/sensitive_data.txt", data="secret")
        assert a.file_path == "/root/sensitive_data.txt"
        assert a.data == "secret"

    def test_observation_defaults(self):
        obs = RvsBObservation()
        assert obs.done is False
        assert obs.reward is None
        assert obs.foothold_gained is False
        assert obs.flag_found is False
        assert obs.open_services == []

    def test_state_defaults(self):
        state = RvsBState()
        assert state.step_count == 0
        assert state.current_task == "stealth_recon"
        assert state.red_score == 0.0
        assert state.time_remaining == 60

    def test_observation_is_serializable(self):
        obs = RvsBObservation(done=True, reward=0.5, open_services=["ssh", "http"])
        d = obs.model_dump()
        assert d["done"] is True
        assert d["reward"] == 0.5
        assert "ssh" in d["open_services"]


# ---------------------------------------------------------------------------
# Environment integration tests (requires server running)
# ---------------------------------------------------------------------------

try:
    import requests
    SERVER_UP = requests.get("http://localhost:7860/api/health", timeout=2).status_code == 200
except Exception:
    SERVER_UP = False


@pytest.mark.skipif(not SERVER_UP, reason="Server not running on localhost:7860")
class TestServerEndpoints:
    BASE = "http://localhost:7860"

    def test_reset_returns_200(self):
        r = requests.post(f"{self.BASE}/reset", timeout=5)
        assert r.status_code == 200

    def test_reset_with_task_id_timeout(self):
        # stealth_recon should have timeout 20
        r = requests.post(f"{self.BASE}/reset", json={"config": {"task_id": "stealth_recon"}}, timeout=5)
        state = requests.get(f"{self.BASE}/state", timeout=5).json()
        assert state["time_remaining"] == 20
        
        # flag_capture should have timeout 60
        r = requests.post(f"{self.BASE}/reset", json={"config": {"task_id": "flag_capture"}}, timeout=5)
        state = requests.get(f"{self.BASE}/state", timeout=5).json()
        assert state["time_remaining"] == 60

    def test_step_phase_violation(self):
        # Exploit before recon should return a negative reward penalty
        requests.post(f"{self.BASE}/reset", timeout=5)
        action = {"type": "exploit", "target_service": "http", "payload": "sqli", "role": "red"}
        r = requests.post(f"{self.BASE}/step", json=action, timeout=10)
        data = r.json()
        assert data["reward"] == -0.1
        assert "phase_violation" in data["metadata"].get("warning", "")

    def test_grader_cvss_schema(self):
        r = requests.get(f"{self.BASE}/grader?task_id=stealth_recon", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert "cvss_breakdown" in data
        assert "audit_metadata" in data
        assert "attack_vector" in data["cvss_breakdown"]

    def test_grader_scores_in_range(self):
        for task_id in ["stealth_recon", "precision_exploit", "flag_capture", "autonomous_defense"]:
            r = requests.get(f"{self.BASE}/grader?task_id={task_id}", timeout=5)
            assert r.status_code == 200
            score = r.json().get("score", -1)
            assert 0.0 <= score <= 1.0, f"Score out of range for {task_id}: {score}"

    def test_tasks_endpoint_returns_4_tasks(self):
        r = requests.get(f"{self.BASE}/tasks", timeout=5)
        assert r.status_code == 200
        data = r.json()
        tasks = data.get("tasks", data) if isinstance(data, dict) else data
        assert len(tasks) == 4
        ids = [t["id"] for t in tasks]
        assert "autonomous_defense" in ids

    def test_state_endpoint(self):
        r = requests.get(f"{self.BASE}/state", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert "episode_id" in data

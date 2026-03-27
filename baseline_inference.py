"""
Baseline Inference Script — Competition Requirement.

Runs a scripted agent through all 3 tasks and prints scores as JSON.
The /baseline endpoint calls this script and parses the last JSON line.
"""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import requests

BASE_URL = "http://localhost:7860"


def run_stealth_recon(session: requests.Session) -> float:
    """Task 1: Use slow scans only to stay under alert threshold."""
    session.post(f"{BASE_URL}/reset")
    score = 0.0
    # 3 slow scans cover all 5 services without aggressive noise
    for _ in range(3):
        resp = session.post(f"{BASE_URL}/step", json={
            "type": "recon",
            "target_ip": "10.0.0.1",
            "scan_intensity": "slow",
        })
        data = resp.json()
        score = data.get("reward", 0.0) or 0.0
        if data.get("done"):
            break
    grader_resp = session.get(f"{BASE_URL}/grader?task_id=stealth_recon")
    return grader_resp.json().get("score", score)


def run_precision_exploit(session: requests.Session) -> float:
    """Task 2: Go straight for the http SQLi vector on first try."""
    session.post(f"{BASE_URL}/reset")
    # First, do a quick recon to find http
    session.post(f"{BASE_URL}/step", json={
        "type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow",
    })
    # Exploit with known payload — zero failed attempts
    resp = session.post(f"{BASE_URL}/step", json={
        "type": "exploit",
        "target_service": "http",
        "payload": "sqli: ' OR 1=1 --",
    })
    grader_resp = session.get(f"{BASE_URL}/grader?task_id=precision_exploit")
    return grader_resp.json().get("score", 0.0)


def run_flag_capture(session: requests.Session) -> float:
    """Task 3: Gain foothold then exfiltrate with correct flag hash hint."""
    session.post(f"{BASE_URL}/reset")
    # Recon → Exploit → Exfiltrate
    session.post(f"{BASE_URL}/step", json={
        "type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow",
    })
    session.post(f"{BASE_URL}/step", json={
        "type": "exploit", "target_service": "http",
        "payload": "sqli: ' OR 1=1 --",
    })
    # The environment reveals the expected hash on a wrong guess —
    # a smarter agent would iterate; baseline makes one correct attempt
    # (in a real competition, the agent would use the hint to brute-force)
    resp = session.post(f"{BASE_URL}/step", json={
        "type": "exfiltrate",
        "file_path": "/root/flag.txt",
        "data": "",  # Empty first to get the hash hint
    })
    hint_data = resp.json()
    expected_hash = hint_data.get("metadata", {}).get("expected_hash", "")

    # baseline: if we can't match we return partial score from exploit
    grader_resp = session.get(f"{BASE_URL}/grader?task_id=flag_capture")
    return grader_resp.json().get("score", 0.0)


def main():
    session = requests.Session()
    scores = {
        "stealth_recon": run_stealth_recon(session),
        "precision_exploit": run_precision_exploit(session),
        "flag_capture": run_flag_capture(session),
    }

    # Validate all scores are in [0.0, 1.0]
    for task, score in scores.items():
        assert 0.0 <= score <= 1.0, f"Score out of range for {task}: {score}"

    # IMPORTANT: last line MUST be parseable JSON — the /baseline endpoint and
    # validator both parse the final stdout line as JSON.
    print(json.dumps({"status": "success", "scores": scores}))
    return scores


if __name__ == "__main__":
    main()

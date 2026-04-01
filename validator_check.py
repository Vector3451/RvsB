"""
Pre-submission Validator — Run this locally before submitting.
Checks openenv.yaml compliance, model schemas, and endpoint availability.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).parent
PASS = "[PASS]"
FAIL = "[FAIL]"


def check(label: str, condition: bool, detail: str = "") -> bool:
    icon = PASS if condition else FAIL
    msg = f"{icon} {label}"
    if detail and not condition:
        msg += f"\n   -> {detail}"
    print(msg)
    return condition


def validate_yaml() -> bool:
    p = ROOT / "openenv.yaml"
    if not p.exists():
        return check("openenv.yaml exists", False, "File not found")
    with open(p) as f:
        data = yaml.safe_load(f)
    ok = check("openenv.yaml — name field", "name" in data)
    ok &= check("openenv.yaml — 3+ tasks", len(data.get("tasks", [])) >= 3,
                f"Found {len(data.get('tasks', []))} tasks")
    return ok


def validate_server(base_url: str) -> bool:
    results = []

    # Health check
    try:
        r = requests.get(base_url, timeout=5)
        results.append(check("GET / returns 200", r.status_code == 200))
    except Exception as e:
        results.append(check("GET / returns 200", False, str(e)))

    # /reset
    try:
        r = requests.post(f"{base_url}/reset", timeout=5)
        results.append(check("POST /reset returns 200", r.status_code == 200))
        results.append(check("POST /reset returns JSON", r.headers.get("content-type", "").startswith("application/json")))
    except Exception as e:
        results.append(check("POST /reset", False, str(e)))

    # /step
    try:
        r = requests.post(f"{base_url}/step", json={
            "type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"
        }, timeout=5)
        results.append(check("POST /step returns 200", r.status_code == 200))
    except Exception as e:
        results.append(check("POST /step", False, str(e)))

    # /state
    try:
        r = requests.get(f"{base_url}/state", timeout=5)
        results.append(check("GET /state returns 200", r.status_code == 200))
    except Exception as e:
        results.append(check("GET /state", False, str(e)))

    # /tasks
    try:
        r = requests.get(f"{base_url}/tasks", timeout=5)
        data = r.json()
        results.append(check("GET /tasks — 3+ tasks", len(data.get("tasks", [])) >= 3))
    except Exception as e:
        results.append(check("GET /tasks", False, str(e)))

    # /grader
    try:
        r = requests.get(f"{base_url}/grader?task_id=stealth_recon", timeout=5)
        data = r.json()
        score = data.get("score", -1)
        results.append(check("GET /grader — score in [0.0, 1.0]", 0.0 <= score <= 1.0,
                             f"Got score={score}"))
    except Exception as e:
        results.append(check("GET /grader", False, str(e)))

    return all(results)


def validate_baseline() -> bool:
    result = subprocess.run(
        [sys.executable, "baseline_inference.py"],
        capture_output=True, text=True, timeout=120, cwd=ROOT
    )
    if result.returncode != 0:
        return check("baseline_inference.py runs without error", False, result.stderr[:200])

    # Parse last JSON line
    last_line = result.stdout.strip().split("\n")[-1]
    try:
        data = json.loads(last_line)
        scores = data.get("scores", {})
        all_valid = all(0.0 <= v <= 1.0 for v in scores.values())
        check("baseline — all scores in [0.0, 1.0]", all_valid, str(scores))
        return all_valid
    except Exception as e:
        return check("baseline — JSON output parseable", False, str(e))


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("  OpenEnv RvsB Pre-Submission Validator")
    print("=" * 55 + "\n")

    print("-- 1. YAML Compliance --")
    yaml_ok = validate_yaml()

    print("\n-- 2. Server Endpoints --")
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"
    print(f"   Testing against: {base_url}")
    server_ok = validate_server(base_url)

    print("\n-- 3. Baseline Inference --")
    baseline_ok = validate_baseline()

    print("\n" + "=" * 55)
    all_ok = yaml_ok and server_ok and baseline_ok
    if all_ok:
        print("  [PASS] ALL CHECKS PASSED - Ready to submit!")
    else:
        print("  [FAIL] SOME CHECKS FAILED - Fix issues before submitting.")
    print("=" * 55 + "\n")
    sys.exit(0 if all_ok else 1)

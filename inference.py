"""
inference.py — Autonomous ReAct (Reasoning + Action) Agent

Runs an LLM-driven agent that thinks and acts dynamically each step.
No scripted action lists — the LLM reads the full situational context
and decides what to do based on what it knows so far.

Required Environment Variables:
  API_BASE_URL  — The LLM API endpoint (e.g. https://api.openai.com/v1)
  MODEL_NAME    — The model identifier (e.g. gpt-4o-mini)
  HF_TOKEN      — Your Hugging Face / OpenAI API key
  ENV_URL       — The environment URL (default: http://localhost:7860)
"""
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from openai import OpenAI

# ── Environment Variable Loading ───────────────────────────────────────────────
API_BASE_URL = os.environ.get("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME   = os.environ.get("MODEL_NAME", "gpt-4o-mini")
HF_TOKEN     = os.environ.get("HF_TOKEN", os.environ.get("OPENAI_API_KEY", ""))
ENV_URL      = os.environ.get("ENV_URL", "http://localhost:7860")
MAX_TOKENS   = 300
MEMORY_DEPTH = 6  # How many recent (action, result) pairs to give the LLM

# ── OpenAI Client ──────────────────────────────────────────────────────────────
client = OpenAI(api_key=HF_TOKEN, base_url=API_BASE_URL) if HF_TOKEN else None

# ── Task Definitions ───────────────────────────────────────────────────────────
TASKS = {
    "stealth_recon": {
        "description": (
            "You are a Red Team agent performing a STEALTH RECON audit on a simulated enterprise network. "
            "Your SOLE objective is to enumerate all running services without triggering the IDS alert system. "
            "Use ONLY passive or slow scanning techniques. Avoid aggressive actions entirely. "
            "Success: find all services with zero or minimal alerts."
        ),
        "role": "red",
        "max_steps": 20,
    },
    "precision_exploit": {
        "description": (
            "You are a Red Team agent executing a PRECISION EXPLOIT operation. "
            "You MUST first recon the target to understand available services before exploiting. "
            "Then, select the single most vulnerable service and exploit it cleanly — avoid failed attempts. "
            "Success: compromise a service in as few steps as possible."
        ),
        "role": "red",
        "max_steps": 40,
    },
    "flag_capture": {
        "description": (
            "You are a Red Team agent performing full PENETRATION TEST including exfiltration. "
            "Follow the kill chain: Recon → Exploit → Gain Foothold → Exfiltrate sensitive data. "
            "Do not skip phases. Once foothold_gained is True, immediately attempt data exfiltration. "
            "Success: exfiltrate the correct sensitive file."
        ),
        "role": "red",
        "max_steps": 60,
    },
    "autonomous_defense": {
        "description": (
            "You are a Blue Team DEFENDER protecting a network from an incoming Red Team attacker. "
            "Monitor for alerts, patch exploitable services proactively, and deploy honeypots on high-risk services. "
            "Prioritize: patch services with highest threat first. React to alert spikes immediately. "
            "Use 'patch', 'honeypot', or 'isolate' payloads. Success: prevent attacker from gaining foothold or exfiltrating data."
        ),
        "role": "blue",
        "max_steps": 60,
    },
}

# ── Valid action schemas per role — used as a hint in the prompt ───────────────
RED_ACTION_HINT = """
Valid action types and their schemas:
- {"type": "recon", "target_ip": "10.0.0.X", "scan_intensity": "passive|slow|aggressive"}
- {"type": "exploit", "target_service": "http|ssh|ftp|smb|rdp|sql|nfs", "payload": "sqli|rce|bruteforce|keyleak|anonymous|eternalblue|bluekeep|defaultcreds|mount|suid"}
- {"type": "exfiltrate", "file_path": "/root/sensitive_data.txt", "data": ""}
"""

BLUE_ACTION_HINT = """
Valid action types and their schemas:
- {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "passive"}
- {"type": "exploit", "target_service": "http|ssh|ftp|smb|rdp|sql|nfs", "payload": "patch|honeypot|isolate", "role": "blue"}
"""


def _build_system_prompt(task: Dict) -> str:
    """Build the system-level persona + rules for the LLM."""
    role = task["role"]
    hint = RED_ACTION_HINT if role == "red" else BLUE_ACTION_HINT
    return (
        f"You are an autonomous cybersecurity agent performing an authorized network security audit.\n"
        f"Role: {role.upper()} TEAM\n\n"
        f"{task['description']}\n\n"
        f"CRITICAL RULES:\n"
        f"1. Respond ONLY with a valid JSON action object. No explanation, no prose.\n"
        f"2. Your action must be ONE of the schemas listed below.\n"
        f"3. Learn from failures — if an action returned reward=0.0 or failed, try a different approach.\n\n"
        f"{hint}"
    )


def _build_user_prompt(obs: Dict, history: List[Tuple[Dict, Dict]], step: int) -> str:
    """Build the per-step user message including current state and action history."""
    recent = ""
    if history:
        lines = []
        for i, (action, result) in enumerate(history[-MEMORY_DEPTH:]):
            reward = result.get("reward", 0)
            done   = result.get("done", False)
            console = result.get("metadata", {}).get("console", "")
            lines.append(
                f"  Step {step - len(history) + i}: action={json.dumps(action)} "
                f"→ reward={reward:.2f}, done={done}, console={console!r}"
            )
        recent = "\nRecent action history (most recent last):\n" + "\n".join(lines)

    return (
        f"Step {step} — Current observation:\n"
        f"{json.dumps(obs, indent=2)}\n"
        f"{recent}\n\n"
        f"Choose your NEXT action. Output ONLY valid JSON."
    )


def llm_decide(task: Dict, obs: Dict, history: List[Tuple[Dict, Dict]], step: int) -> Optional[Dict]:
    """
    Ask the LLM to choose the next action based on full situational context.
    Returns a parsed action dict, or None if LLM is unavailable or fails.
    """
    if not client:
        return None

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system",  "content": _build_system_prompt(task)},
                {"role": "user",    "content": _build_user_prompt(obs, history, step)},
            ],
            temperature=0.4,
            max_tokens=MAX_TOKENS,
        )
        raw = response.choices[0].message.content.strip()
        # Strip any markdown code block wrappers if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"[LLM] Decision failed at step {step}: {e}", file=sys.stderr)
        return None


def _fallback_action(task_id: str, role: str, obs: Dict) -> Dict:
    """
    Tactical fallback used when no API key is provided or LLM fails.
    Still smarter than random: uses observation to decide.
    """
    open_svcs = obs.get("open_services", ["http"])
    has_foothold = obs.get("foothold_gained", False)
    alerts = obs.get("alerts_count", 0)

    if role == "blue":
        target = open_svcs[0] if open_svcs else "http"
        payload = "honeypot" if alerts > 3 else "patch"
        return {"type": "exploit", "target_service": target, "payload": payload, "role": "blue"}

    # Red fallbacks follow kill chain
    if task_id in ("flag_capture", "precision_exploit") and has_foothold:
        return {"type": "exfiltrate", "file_path": "/root/sensitive_data.txt", "data": ""}
    if obs.get("found_services_count", 0) > 0 and task_id != "stealth_recon":
        target = open_svcs[0] if open_svcs else "http"
        return {"type": "exploit", "target_service": target, "payload": "sqli"}
    return {"type": "recon", "target_ip": "10.0.0.1", "scan_intensity": "slow"}


def run_task(session: requests.Session, task_id: str) -> float:
    """
    Run a single task with the autonomous ReAct loop.
    - No scripted action list.
    - The LLM observes, reasons, and acts each step.
    - Falls back to observation-aware heuristics if no API key.
    """
    task = TASKS[task_id]
    role = task["role"]
    max_steps = task["max_steps"]

    session.post(f"{ENV_URL}/reset")
    obs: Dict[str, Any] = {}
    history: List[Tuple[Dict, Dict]] = []
    step = 0

    print(f"\n{'='*60}")
    print(f"[{role.upper()}] Task: {task_id.upper().replace('_', ' ')}")
    print(f"{'='*60}")

    while step < max_steps:
        # Ask LLM to decide — it reasons over full history
        action = llm_decide(task, obs, history, step)

        # If LLM unavailable or fails, use smarter fallback
        if action is None:
            action = _fallback_action(task_id, role, obs)
            source = "FALLBACK"
        else:
            source = "LLM"

        print(f"  [{source}] Step {step}: {json.dumps(action)}")

        try:
            resp = session.post(f"{ENV_URL}/step", json=action, timeout=30)
            obs = resp.json()
        except Exception as e:
            print(f"  [ERROR] Step failed: {e}", file=sys.stderr)
            break

        reward = obs.get("reward", 0.0)
        done   = obs.get("done", False)
        console = obs.get("metadata", {}).get("console", "")
        print(f"         → reward={reward:.3f}, done={done}, {console!r}")

        history.append((action, obs))
        step += 1

        if done:
            print(f"  [DONE] Task ended at step {step}")
            break

        # Throttle slightly to avoid API rate limits
        if client and HF_TOKEN:
            time.sleep(0.5)

    # Fetch final grade
    try:
        grader_resp = session.get(f"{ENV_URL}/grader?task_id={task_id}", timeout=10)
        score = float(grader_resp.json().get("score", 0.0))
    except Exception:
        score = 0.0

    print(f"\n  ✅ Final Score for {task_id}: {score:.3f}")
    return score


def main():
    if not ENV_URL:
        print(json.dumps({"status": "error", "message": "ENV_URL not set"}))
        sys.exit(1)

    if not HF_TOKEN:
        print(
            "[WARNING] No HF_TOKEN / OPENAI_API_KEY found. "
            "Running in observation-aware fallback mode.",
            file=sys.stderr,
        )

    session = requests.Session()

    scores = {}
    for task_id in TASKS:
        scores[task_id] = run_task(session, task_id)

    # Validate all scores are in [0.0, 1.0]
    for task, score in scores.items():
        assert 0.0 <= score <= 1.0, f"Score out of range for {task}: {score}"

    # IMPORTANT: last line must be parseable JSON for the validator
    print(json.dumps({"status": "success", "scores": scores}))
    return scores


if __name__ == "__main__":
    main()

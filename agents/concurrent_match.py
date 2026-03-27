"""
Concurrent Match Engine — Red and Blue agents compete simultaneously.

Architecture:
  - Both agents share the SAME environment instance.
  - Turns alternate: Red acts → env updates → Blue observes & reacts.
  - Each step is streamed to the SSE queue so the UI updates live.
  - Network state (services, alerts, foothold) emitted each turn for the map.
"""
import threading
import time
from typing import Any, Callable, Dict, List, Optional

import requests

from agents.llm import reasoning_layer as llm
from agents.memory import episode_store as mem
from agents.rl.ppo_agent import ACTION_MAP, ACTION_NAMES, PPOPolicy, _encode_obs
from agents.report import generator as report_gen

ENV_URL = "http://localhost:7860"


def _post(env_url: str, path: str, body: Optional[Dict] = None) -> Dict:
    r = requests.post(f"{env_url}{path}", json=body or {}, timeout=10)
    r.raise_for_status()
    return r.json()


def _get(env_url: str, path: str, params: Optional[Dict] = None) -> Dict:
    r = requests.get(f"{env_url}{path}", params=params, timeout=10)
    r.raise_for_status()
    return r.json()


BLUE_VALID = {0, 1, 6, 7, 8, 9}  # passive scan, slow scan, patch-*, monitor


def run_concurrent_match(
    env_url: str,
    red_model: str,
    blue_model: str,
    max_steps: int,
    emit: Callable[[str, Any], None],
) -> Dict:
    """
    Run one full match with both agents alternating turns.

    emit(event_type, data) is called for every event so the API can
    forward it to SSE subscribers.
    """
    red_policy = PPOPolicy("red", save_path="agents/rl/red_policy.json")
    blue_policy = PPOPolicy("blue", save_path="agents/rl/blue_policy.json",
                            epsilon=0.4)
    llm_available = llm.is_available()

    red_trajectory: List = []
    blue_trajectory: List = []
    red_mistakes: List[str] = []
    blue_mistakes: List[str] = []
    timeline: List[str] = []

    # --- Reset env ---
    obs = _post(env_url, "/reset")
    emit("match_start", {
        "message": "Match started — Red and Blue competing simultaneously",
        "env_url": env_url,
        "red_model": red_model,
        "blue_model": blue_model,
    })
    emit("network_state", _build_network_state(obs, step=0))

    prev_obs = dict(obs)

    for step in range(max_steps):
        if obs.get("done"):
            break

        # ── RED TURN ──────────────────────────────────────────────────
        red_state = _encode_obs(obs, step, "red")
        red_idx, _ = red_policy.select_action(red_state)
        red_action = dict(ACTION_MAP[red_idx])
        red_name = ACTION_NAMES[red_idx]

        red_reasoning = ""
        if llm_available and step % 3 == 0:
            red_reasoning = llm.red_step_reasoning(obs, red_name, step)

        obs = _post(env_url, "/step", red_action)
        red_reward = float(obs.get("reward") or 0.0)
        red_trajectory.append((red_state, red_idx, red_reward))

        if red_reward < 0 or (obs.get("failed_attempts", 0) > 0 and red_reward == 0):
            red_mistakes.append(f"Step {step+1}: {red_name} failed (r={red_reward:.2f})")

        entry = f"[{step+1:02d}][RED]  {red_name:<22} reward={red_reward:.3f}"
        if red_reasoning:
            entry += f"  |  {red_reasoning[:70]}"
        timeline.append(entry)

        emit("red_action", {
            "step": step + 1,
            "action": red_name,
            "reward": red_reward,
            "reasoning": red_reasoning,
            "log": entry,
        })
        emit("network_state", _build_network_state(obs, step + 1))

        if obs.get("done"):
            break
        time.sleep(0.15)

        # ── BLUE TURN ─────────────────────────────────────────────────
        blue_state = _encode_obs(obs, step, "blue")
        blue_idx, _ = blue_policy.select_action(blue_state)
        if blue_idx not in BLUE_VALID:
            blue_idx = 9
        blue_action = dict(ACTION_MAP[blue_idx])
        blue_name = ACTION_NAMES[blue_idx]

        blue_reasoning = ""
        if llm_available and step % 4 == 0:
            blue_reasoning = llm.blue_step_reasoning(obs, blue_name, step)

        obs_after = _post(env_url, "/step", blue_action)

        # Blue reward: defend = inverse of red progress
        blue_reward = _blue_reward(obs_after, obs)
        blue_trajectory.append((blue_state, blue_idx, blue_reward))

        if blue_reward < 0:
            blue_mistakes.append(
                f"Step {step+1}: {blue_name} left attacker unchecked (r={blue_reward:.2f})"
            )

        blue_entry = f"[{step+1:02d}][BLUE] {blue_name:<22} defence={blue_reward:.3f}"
        if blue_reasoning:
            blue_entry += f"  |  {blue_reasoning[:70]}"
        timeline.append(blue_entry)

        emit("blue_action", {
            "step": step + 1,
            "action": blue_name,
            "reward": blue_reward,
            "reasoning": blue_reasoning,
            "log": blue_entry,
        })

        obs = obs_after
        emit("network_state", _build_network_state(obs, step + 1))
        time.sleep(0.1)

    # ── Post-episode learning ─────────────────────────────────────────
    red_loss  = red_policy.update(red_trajectory)
    blue_loss = blue_policy.update(blue_trajectory)
    red_policy.save()
    blue_policy.save()

    red_scores = {
        t: _get(env_url, "/grader", {"task_id": t}).get("score", 0.0)
        for t in ("stealth_recon", "precision_exploit", "flag_capture")
    }
    avg_red  = sum(r for _, _, r in red_trajectory)  / max(len(red_trajectory), 1)
    avg_blue = sum(r for _, _, r in blue_trajectory) / max(len(blue_trajectory), 1)

    red_strategy = blue_strategy = ""
    if llm_available:
        if red_mistakes:
            red_strategy = llm.post_episode_debrief("red", [], red_scores, red_mistakes)
        if blue_mistakes:
            blue_debrief_scores = {k: round(1 - v, 3) for k, v in red_scores.items()}
            blue_strategy = llm.post_episode_debrief("blue", [], blue_debrief_scores, blue_mistakes)

    mem.save_episode("red",  red_policy.episode_count,  red_scores,
                     red_mistakes,  red_strategy,  avg_red)
    mem.save_episode("blue", blue_policy.episode_count,
                     {k: round(1 - v, 3) for k, v in red_scores.items()},
                     blue_mistakes, blue_strategy, avg_blue)

    # ── Report ───────────────────────────────────────────────────────
    report_path = report_gen.generate(
        red_scores=red_scores,
        episode_count=red_policy.episode_count,
        attack_timeline=timeline,
        red_stats=red_policy.stats(),
        blue_stats=blue_policy.stats(),
    )

    result = {
        "red_scores":  red_scores,
        "blue_scores": {k: round(1 - v, 3) for k, v in red_scores.items()},
        "red_stats":   red_policy.stats(),
        "blue_stats":  blue_policy.stats(),
        "timeline":    timeline,
        "report_path": str(report_path),
    }
    emit("match_end", result)
    return result


# ── Helpers ──────────────────────────────────────────────────────────────────

def _blue_reward(obs: Dict, prev_obs: Dict) -> float:
    r = float(obs.get("reward") or 0.0)
    new_alerts = obs.get("alerts_count", 0) - prev_obs.get("alerts_count", 0)
    if new_alerts > 0:
        r += 0.1 * new_alerts
    if obs.get("foothold_gained") and not prev_obs.get("foothold_gained"):
        r -= 0.5
    if obs.get("flag_found"):
        r -= 1.0
    return round(r, 3)


def _build_network_state(obs: Dict, step: int) -> Dict:
    """Build the network map payload consumed by the React live map."""
    services = ["ssh", "http", "ftp", "smb", "rdp"]
    open_svc  = obs.get("open_services",   [])
    patched   = obs.get("patched_services", [])

    nodes = []
    for i, svc in enumerate(services):
        angle = (i / len(services)) * 360
        nodes.append({
            "id":      svc,
            "label":   svc.upper(),
            "angle":   angle,
            "status":  "patched"    if svc in patched
                       else "open"  if svc in open_svc
                       else "hidden",
        })

    return {
        "step":             step,
        "nodes":            nodes,
        "alerts":           obs.get("alerts_count",    0),
        "foothold":         obs.get("foothold_gained", False),
        "flag_captured":    obs.get("flag_found",      False),
        "attacker_at":      open_svc[-1] if open_svc else None,
    }

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


def color_print(role: str, msg: str):
    """Helper for pretty terminal logging during match."""
    colors = {
        "red": "\033[91m",
        "blue": "\033[94m",
        "system": "\033[93m",
        "success": "\033[92m",
        "reset": "\033[0m"
    }
    prefix = f"[{role.upper()}] "
    c = colors.get(role.lower(), colors["reset"])
    print(f"{c}{prefix}{msg}{colors['reset']}")


# Thread-local storage for concurrent match session isolation
_tls = threading.local()

def _post(env_url: str, path: str, body: Optional[Dict] = None) -> Dict:
    sid = getattr(_tls, "session_id", "default")
    r = requests.post(f"{env_url}{path}", json=body or {}, headers={"x-session-id": sid}, timeout=10)
    r.raise_for_status()
    return r.json()

def _get(env_url: str, path: str, params: Optional[Dict] = None) -> Dict:
    sid = getattr(_tls, "session_id", "default")
    r = requests.get(f"{env_url}{path}", params=params, headers={"x-session-id": sid}, timeout=10)
    r.raise_for_status()
    return r.json()


BLUE_VALID = set(range(22, 40))  # Patching (22-28), Active Defense (29-32), Monitoring (33-39)


def run_concurrent_match(
    env_url: str,
    red_model: str,
    blue_model: str,
    max_steps: int,
    emit: Callable[[str, Any], None],
    red_guidance: str = "",
    blue_guidance: str = "",
    config: Optional[Dict] = None,
    red_agents: int = 1,
    blue_agents: int = 1,
) -> Dict:
    """
    Run one full match with both agents alternating turns.

    emit(event_type, data) is called for every event so the API can
    forward it to SSE subscribers.
    """
    # Assign a unique session ID to this thread
    import uuid
    _tls.session_id = str(uuid.uuid4())

    # Initialize multiple policies for multi-agent teams
    red_policies = [
        PPOPolicy("red", save_path="data/red_policy.json")
        for _ in range(max(1, red_agents))
    ]
    blue_policies = [
        PPOPolicy("blue", save_path="data/blue_policy.json", epsilon=0.4)
        for _ in range(max(0, blue_agents))
    ]
    llm_available = llm.is_available()

    red_trajectory: List = []
    blue_trajectory: List = []
    red_mistakes: List[str] = []
    blue_mistakes: List[str] = []
    timeline: List[str] = []

    # Map Template Config to Env Format
    env_config = {}
    if config:
        services = list(config.get("services", {}).keys())
        exploitable = config.get("exploitable", [])
        task_id = config.get("task_id")
        env_config = {"nodes": services, "exploitable": exploitable}
        if task_id:
            env_config["task_id"] = task_id

    # --- Reset env ---
    obs = _post(env_url, "/reset", {"config": env_config})
    emit("match_start", {
        "message": "Match started — Red and Blue competing simultaneously",
        "env_url": env_url,
        "red_model": red_model,
        "blue_model": blue_model,
    })
    emit("network_state", _build_network_state(obs, step=0, config=config))

    prev_obs = dict(obs)

    for step in range(max_steps):
        if obs.get("done"):
            break

        # ── RED TURNS (all red agents act sequentially) ───────────────────
        for agent_idx, red_policy in enumerate(red_policies):
            red_state = _encode_obs(obs, step, "red")

            # ── Smart action selection: pick from task-relevant pool ──
            task_id = (env_config.get("task_id") or "stealth_recon") if env_config else "stealth_recon"
            if task_id == "stealth_recon":
                red_candidates = [0, 1, 33, 34, 35]
            elif task_id == "precision_exploit":
                if not obs.get("foothold_gained"):
                    found = obs.get("open_services", [])
                    red_candidates = [0, 1, 2] if not found else [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
                else:
                    red_candidates = [3, 4, 5, 6, 7, 13, 14]
            else:  # flag_capture / full chain
                if not obs.get("open_services"):
                    red_candidates = [0, 1, 2]
                elif not obs.get("foothold_gained"):
                    red_candidates = [3, 4, 5, 6, 9, 12, 13]
                else:
                    red_candidates = [17, 18, 19, 20, 21]

            red_idx, _ = red_policy.select_action(red_state)
            if red_idx not in set(red_candidates):
                import random as _r
                red_idx = _r.choice(red_candidates)

            red_action = dict(ACTION_MAP[red_idx])
            red_action["role"] = "red"
            red_name = ACTION_NAMES[red_idx]

            red_reasoning = ""
            if llm_available and step % 3 == 0:
                red_reasoning = llm.red_step_reasoning(obs, red_name, step)

            obs = _post(env_url, "/step", red_action)
            red_reward = float(obs.get("reward") or 0.0)
            red_trajectory.append((red_state, red_idx, red_reward))

            if red_reward < 0 or (obs.get("failed_attempts", 0) > 0 and red_reward == 0):
                red_mistakes.append(f"Step {step+1} [A{agent_idx+1}]: {red_name} failed (r={red_reward:.2f})")

            entry = f"[{step+1:02d}][RED-A{agent_idx+1}] {red_name:<22} reward={red_reward:.3f}"
            if red_reasoning:
                entry += f"  |  {red_reasoning[:70]}"
            timeline.append(entry)

            # Terminal Logging (Simplified for stdout)
            color_print("red", f"Step {step+1} [Agent {agent_idx+1}]: {red_name} -> Reward: {red_reward:.3f}")
            if "console" in obs.get("metadata", {}):
                print(f"      \033[90m> {obs['metadata']['console']}\033[0m")

            # Update SSE metadata
            sse_metadata = dict(obs.get("metadata", {}))
            if "console" in sse_metadata:
                sse_metadata["cmd"] = sse_metadata["console"]

            emit("red_action", {
                "step": step + 1,
                "agent_id": agent_idx + 1,
                "action": red_name,
                "reward": red_reward,
                "reasoning": red_reasoning,
                "log": entry,
                "metadata": sse_metadata
            })
            emit("network_state", _build_network_state(obs, step + 1, config))

            if obs.get("done"):
                break
        
        time.sleep(1.5)

        # ── BLUE TURNS (all blue agents act sequentially) ─────────────────
        for agent_idx, blue_policy in enumerate(blue_policies):
            blue_state = _encode_obs(obs, step, "blue")
            blue_idx, _ = blue_policy.select_action(blue_state)
            if blue_idx not in BLUE_VALID:
                blue_idx = 33
            blue_action = dict(ACTION_MAP[blue_idx])
            blue_action["role"] = "blue"
            blue_name = ACTION_NAMES[blue_idx]

            blue_reasoning = ""
            if llm_available and step % 4 == 0:
                blue_reasoning = llm.blue_step_reasoning(obs, blue_name, step)

            obs_after = _post(env_url, "/step", blue_action)
            blue_reward = _blue_reward(obs_after, obs)
            blue_trajectory.append((blue_state, blue_idx, blue_reward))

            if blue_reward < 0:
                blue_mistakes.append(f"Step {step+1} [A{agent_idx+1}]: {blue_name} left attacker unchecked (r={blue_reward:.2f})")

            blue_entry = f"[{step+1:02d}][BLUE-A{agent_idx+1}] {blue_name:<22} defence={blue_reward:.3f}"
            if blue_reasoning:
                blue_entry += f"  |  {blue_reasoning[:70]}"
            timeline.append(blue_entry)

            # Terminal Logging (Simplified for stdout)
            color_print("blue", f"Step {step+1} [Agent {agent_idx+1}]: {blue_name} -> Reward: {blue_reward:.3f}")
            if "console" in obs_after.get("metadata", {}):
                print(f"      \033[90m> {obs_after['metadata']['console']}\033[0m")

            # Update SSE metadata
            sse_metadata_blue = dict(obs_after.get("metadata", {}))
            if "console" in sse_metadata_blue:
                sse_metadata_blue["cmd"] = sse_metadata_blue["console"]

            emit("blue_action", {
                "step": step + 1,
                "agent_id": agent_idx + 1,
                "action": blue_name,
                "reward": blue_reward,
                "reasoning": blue_reasoning,
                "log": blue_entry,
                "metadata": sse_metadata_blue
            })

            obs = obs_after
            emit("network_state", _build_network_state(obs, step + 1, config))
            time.sleep(0.05)

    # ── Post-episode learning for all agents ─────────────────────────────
    for red_policy in red_policies:
        red_policy.update(red_trajectory)
        red_policy.save()
    for blue_policy in blue_policies:
        blue_policy.update(blue_trajectory)
        blue_policy.save()
    red_loss = 0.0
    blue_loss = 0.0

    red_scores = {
        t: _get(env_url, "/grader", {"task_id": t}).get("score", 0.0)
        for t in ("stealth_recon", "precision_exploit", "flag_capture")
    }
    avg_red  = sum(r for _, _, r in red_trajectory)  / max(len(red_trajectory), 1)
    avg_blue = sum(r for _, _, r in blue_trajectory) / max(len(blue_trajectory), 1)

    red_strategy = blue_strategy = ""
    if llm_available:
        if red_mistakes:
            red_strategy = llm.post_episode_debrief("red", [], red_scores, red_mistakes, red_guidance)
        if blue_mistakes:
            blue_debrief_scores = {k: round(1 - v, 3) for k, v in red_scores.items()}
            blue_strategy = llm.post_episode_debrief("blue", [], blue_debrief_scores, blue_mistakes, blue_guidance)

    if red_policies:
        mem.save_episode("red",  red_policies[0].episode_count,  red_scores,
                         red_mistakes,  red_strategy,  avg_red)
    # Only save memory for Blue if an agent exists
    if blue_policies:
        mem.save_episode("blue", blue_policies[0].episode_count,
                         {k: round(1 - v, 3) for k, v in red_scores.items()},
                         blue_mistakes, blue_strategy, avg_blue)

    red_stats = red_policies[0].stats() if red_policies else {}
    blue_stats = blue_policies[0].stats() if blue_policies else {}
    red_episodes = red_policies[0].episode_count if red_policies else 0

    # ── Report ───────────────────────────────────────────────────────
    report_path = report_gen.generate(
        red_scores=red_scores,
        episode_count=red_episodes,
        attack_timeline=timeline,
        red_stats=red_stats,
        blue_stats=blue_stats,
        config=config,
    )

    security_score = 0
    vuln_matrix = []
    
    if config and "services" in config:
        total_svcs = len(config["services"])
        exploitable = len(config.get("exploitable", []))
        security_score = round(((total_svcs - exploitable) / max(1, total_svcs)) * 100)
        for svc_id, svc_data in config["services"].items():
            is_exploit = svc_id in config.get("exploitable", [])
            vuln_matrix.append({
                "id": svc_id,
                "label": svc_data.get("label", svc_id),
                "exploitable": is_exploit
            })
    else:
        overall_red = sum(red_scores.values()) / max(len(red_scores), 1)
        security_score = round((1 - overall_red) * 100)

    result = {
        "red_scores":  red_scores,
        "blue_scores": {k: round(1 - v, 3) for k, v in red_scores.items()},
        "red_stats":   red_stats,
        "blue_stats":  blue_stats,
        "timeline":    timeline,
        "report_path": str(report_path),
        "security_score": security_score,
        "vuln_matrix": vuln_matrix,
    }

    # Final Summary Table
    print("\n" + "="*60)
    color_print("system", f"MATCH COMPLETE — {max_steps} STEPS EXHAUSTED")
    print("-" * 60)
    print(f"{'TASK':<20} | {'RED SCORE':<15} | {'BLUE SCORE':<15}")
    print("-" * 60)
    for task, score in red_scores.items():
        print(f"{task:<20} | {score:<15.3f} | {1-score:<15.3f}")
    print("-" * 60)
    color_print("success", f"Report Generated: {report_path}")
    print("="*60 + "\n")

    emit("match_end", result)
    return result


# ── Helpers ──────────────────────────────────────────────────────────────────

def _blue_reward(obs: Dict, prev_obs: Dict) -> float:
    """Compute Blue's reward — balanced so Red has a fair chance."""
    r = 0.0
    # Blue earns for every service it patches
    new_patched = len(obs.get("patched_services", [])) - len(prev_obs.get("patched_services", []))
    if new_patched > 0:
        r += 0.2 * new_patched
    # Blue loses when attacker gains foothold
    if obs.get("foothold_gained") and not prev_obs.get("foothold_gained"):
        r -= 0.3
    # Blue loses heavily when data is exfiltrated
    if obs.get("flag_found") and not prev_obs.get("flag_found"):
        r -= 0.8
    return round(r, 3)


def _build_network_state(obs: Dict, step: int, config: Optional[Dict] = None) -> Dict:
    """Build the network map payload consumed by the React live map."""
    if config and "services" in config:
        services = list(config.get("services", {}).keys())
    else:
        services = ["ssh", "http", "ftp", "smb", "rdp"]
        
    open_svc  = obs.get("open_services",   [])
    patched   = obs.get("patched_services", [])

    nodes = []
    for i, svc in enumerate(services):
        angle = (i / len(services)) * 360
        label = config.get("services", {}).get(svc, {}).get("label", svc.split('_')[0].upper()) if config else svc.split('_')[0].upper()
        nodes.append({
            "id":      svc,
            "label":   label,
            "angle":   angle,
            "status":  "patched" if svc in patched else "open",
            "discovered": bool((svc in open_svc) or (svc in patched))
        })

    return {
        "step":             step,
        "nodes":            nodes,
        "alerts":           obs.get("alerts_count",    0),
        "foothold":         obs.get("foothold_gained", False),
        "flag_captured":    obs.get("flag_found",      False),
        "attacker_at":      open_svc[-1] if open_svc else None,
    }

"""
LLM Reasoning Layer — dolphin-llama3 via Ollama.

Provides two capabilities:
  1. inter_step_reasoning(): called each step to narrate the agent's thinking
  2. post_episode_debrief(): called after an episode to reflect on mistakes
     and generate an updated strategy string the RL policy uses as context
"""
import json
import logging
from typing import Any, Dict, List, Optional

import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "dolphin-llama3:latest"
log = logging.getLogger("LLM")


def _call(prompt: str, max_tokens: int = 300, timeout: int = 60) -> str:
    """Raw call to Ollama generate endpoint."""
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.4,
            "top_p": 0.9,
        },
    }
    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except Exception as e:
        log.warning("LLM call failed: %s", e)
        return ""


def is_available() -> bool:
    """Check if Ollama is running and dolphin-llama3 is loaded."""
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = [m["name"] for m in r.json().get("models", [])]
        return any("dolphin-llama3" in m for m in models)
    except Exception:
        return False


def red_step_reasoning(obs: Dict[str, Any], action_name: str, step: int) -> str:
    """
    Generate attacker reasoning for a given step.
    Returns a concise tactical thought (1–2 sentences).
    """
    prompt = f"""You are an elite red team hacker. Current situation:
- Step: {step}
- Open services found: {obs.get('open_services', [])}
- Alerts triggered: {obs.get('alerts_count', 0)}
- Foothold gained: {obs.get('foothold_gained', False)}
- Failed attempts: {obs.get('failed_attempts', 0)}

You chose action: {action_name}

In one sentence, explain your tactical reasoning for this action. Be concise and technical."""
    return _call(prompt, max_tokens=80)


def blue_step_reasoning(obs: Dict[str, Any], action_name: str, step: int) -> str:
    """Generate defender reasoning for a given step."""
    prompt = f"""You are a senior security analyst defending a network. Current situation:
- Step: {step}
- Alert count: {obs.get('alerts_count', 0)}
- Intrusion detected: {obs.get('intrusion_detected', False)}
- Patched services: {obs.get('patched_services', [])}
- Open services: {obs.get('open_services', [])}

You chose action: {action_name}

In one sentence, explain your defensive decision. Be concise and technical."""
    return _call(prompt, max_tokens=80)


def post_episode_debrief(
    role: str,
    trajectory: List[Dict],
    scores: Dict[str, float],
    mistakes: List[str],
) -> str:
    """
    After an episode, the agent reflects on what went wrong
    and outputs an improved strategy for next time.
    Returns a strategy string stored in episode memory.
    """
    mistakes_str = "\n".join(f"- {m}" for m in mistakes[:5]) or "None noted"
    score_str = "\n".join(f"  {k}: {v:.3f}" for k, v in scores.items())

    if role == "red":
        prompt = f"""You are an expert red team operator reviewing a failed attack.
Scores achieved:
{score_str}
Key mistakes made:
{mistakes_str}

Write 2-3 specific, actionable improvements for the NEXT attack attempt.
Focus on technique, timing, and target prioritization. Be concise."""
    else:
        prompt = f"""You are a veteran blue team incident responder reviewing a defence.
Defence scores (1 - attacker score):
{score_str}
Key mistakes made:
{mistakes_str}

Write 2-3 specific improvements for next time.
Focus on detection speed, patch priority, and alert response. Be concise."""

    return _call(prompt, max_tokens=200)


def generate_rating_report(
    red_scores: Dict[str, float],
    blue_scores: Dict[str, float],
    attack_timeline: List[str],
    target_label: str = "Simulated Corporate Network",
) -> str:
    """
    Generate a professional security assessment report using the LLM.
    Returns an HTML string.
    """
    timeline_str = "\n".join(f"  {i+1}. {e}" for i, e in enumerate(attack_timeline[:15]))
    overall_red = round(sum(red_scores.values()) / max(len(red_scores), 1), 2)
    overall_blue = round(sum(blue_scores.values()) / max(len(blue_scores), 1), 2)
    security_score = round((1 - overall_red) * 100)

    prompt = f"""You are a senior penetration tester writing an executive security report.

Target: {target_label}
Overall Security Score: {security_score}/100
Attack Success Rate: {overall_red * 100:.1f}%
Defence Effectiveness: {overall_blue * 100:.1f}%

Attack Timeline:
{timeline_str}

Per-Task Scores:
  Stealth Recon — Red: {red_scores.get('stealth_recon', 0):.2f}
  Precision Exploit — Red: {red_scores.get('precision_exploit', 0):.2f}
  Flag Capture — Red: {red_scores.get('flag_capture', 0):.2f}

Write a professional 3-paragraph security assessment including:
1. Executive summary (risk level, key finding)
2. Technical findings (what the attacker exploited)
3. Recommendations (what the defender should improve)

Be professional and specific. Do not use markdown, plain text only."""

    return _call(prompt, max_tokens=500, timeout=120)

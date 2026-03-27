"""
Orchestrator — Runs Red Team and Blue Team agents concurrently in the same episode.

Architecture:
  - The environment is stateful (single shared game state).
  - Red Team drives the main /step loop (attacker controls pace).
  - Blue Team observes /state and interjects /step patches between Red steps.
  - Both agents' scores are tracked per task and printed as a match scorecard.

Usage:
  python agents/orchestrator.py [ENV_URL]

  ENV_URL defaults to the local Docker container.
  For HF Space: python agents/orchestrator.py https://Vector11187u-Docker.hf.space
"""
import argparse
import logging
import sys
import threading
import time
from pathlib import Path
from typing import Dict

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.blue_team import BlueTeamAgent
from agents.red_team import RedTeamAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(name)-10s]  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ORCHESTRATOR")

# ── Shared state between threads ──────────────────────────────────────────────
_LATEST_OBS: Dict = {}
_EPISODE_DONE = threading.Event()
_LOCK = threading.Lock()


def red_thread(agent: RedTeamAgent) -> Dict[str, float]:
    """Red Team runs every step and controls episode flow."""
    obs = agent.reset()
    agent.on_episode_start()

    for step in range(agent.max_steps):
        with _LOCK:
            global _LATEST_OBS
            _LATEST_OBS = obs

        if obs.get("done"):
            log.info("[RED] Episode done at step %d.", step)
            break

        action = agent.decide(obs)
        log.info("[RED] Step %d | action=%-12s", step + 1, action.get("type"))
        obs = agent.step(action)
        reward = obs.get("reward") or 0.0
        log.info("[RED]        reward=%.3f | alerts=%d | foothold=%s",
                 reward, obs.get("alerts_count", 0), obs.get("foothold_gained", False))
        time.sleep(0.3)   # Give Blue Team a window to react

    _EPISODE_DONE.set()
    scores = {
        task: agent.get_grader_score(task)
        for task in ("stealth_recon", "precision_exploit", "flag_capture")
    }
    agent.on_episode_end(scores)
    return scores


def blue_thread(agent: BlueTeamAgent) -> None:
    """Blue Team reacts to state changes between Red Team steps."""
    agent.on_episode_start()

    while not _EPISODE_DONE.is_set():
        with _LOCK:
            obs = dict(_LATEST_OBS)

        if not obs:
            time.sleep(0.1)
            continue

        action = agent.decide(obs)

        # Blue team only interjects if there's something to do (no constant noise)
        if action.get("type") != "recon" or action.get("scan_intensity") == "passive":
            try:
                result = agent.step(action)
                log.info("[BLUE] Interjected: %-12s | reward=%.3f",
                         action.get("type"), result.get("reward") or 0.0)
            except Exception as e:
                log.warning("[BLUE] Step failed: %s", e)

        time.sleep(0.4)  # Blue reacts slightly slower than Red attacks


def run_match(env_url: str, episodes: int = 1) -> None:
    red = RedTeamAgent(env_url, max_steps=60)
    blue = BlueTeamAgent(env_url, max_steps=60)

    all_red_scores = []
    all_blue_defence = []

    for ep in range(1, episodes + 1):
        log.info("\n%s\n  MATCH START — Episode %d / %d\n  Environment: %s\n%s",
                 "=" * 60, ep, episodes, env_url, "=" * 60)

        _EPISODE_DONE.clear()
        red_scores: Dict[str, float] = {}

        # Run threads
        red_t = threading.Thread(
            target=lambda: red_scores.update(red_thread(red)), daemon=True
        )
        blue_t = threading.Thread(target=lambda: blue_thread(blue), daemon=True)

        blue_t.start()
        time.sleep(0.1)   # Let Blue start first (defenders prepare)
        red_t.start()

        red_t.join(timeout=120)
        _EPISODE_DONE.set()
        blue_t.join(timeout=5)

        # Compute scorecard
        blue_defence = {k: round(1.0 - v, 3) for k, v in red_scores.items()}
        all_red_scores.append(red_scores)
        all_blue_defence.append(blue_defence)

        # Print scorecard
        _print_scorecard(ep, red_scores, blue_defence)

    # Final summary across all episodes
    if episodes > 1:
        avg_red = {
            k: round(sum(s[k] for s in all_red_scores) / episodes, 3)
            for k in ("stealth_recon", "precision_exploit", "flag_capture")
        }
        avg_blue = {k: round(1.0 - avg_red[k], 3) for k in avg_red}
        log.info("\n%s\n  FINAL AVERAGES (%d episodes)\n%s", "=" * 60, episodes, "=" * 60)
        _print_scorecard("AVG", avg_red, avg_blue)


def _print_scorecard(episode, red: Dict[str, float], blue: Dict[str, float]) -> None:
    log.info("")
    log.info("  +%s+", "-" * 58)
    log.info("  | SCORECARD — Episode %-36s|", episode)
    log.info("  +%-22s+%-18s+%-16s+", "-" * 22, "-" * 18, "-" * 16)
    log.info("  | %-20s | %-16s | %-14s |", "TASK", "RED (attack)", "BLUE (defence)")
    log.info("  +%-22s+%-18s+%-16s+", "-" * 22, "-" * 18, "-" * 16)
    for task in ("stealth_recon", "precision_exploit", "flag_capture"):
        r = red.get(task, 0.0)
        b = blue.get(task, 0.0)
        winner = "RED" if r > b else "BLUE" if b > r else "DRAW"
        log.info("  | %-20s | %8.3f       | %8.3f [%s] |",
                 task, r, b, winner)
    log.info("  +%-22s+%-18s+%-16s+", "-" * 22, "-" * 18, "-" * 16)
    log.info("")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RvsB Match Orchestrator")
    parser.add_argument(
        "env_url",
        nargs="?",
        default="http://localhost:7860",
        help="Environment URL (default: http://localhost:7860)",
    )
    parser.add_argument(
        "--episodes",
        type=int,
        default=1,
        help="Number of episodes to run (default: 1)",
    )
    args = parser.parse_args()
    run_match(args.env_url, args.episodes)

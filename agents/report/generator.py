"""
Report Generator — Produces an HTML security rating report after each match.
Uses the LLM for the narrative sections and computes CVSS-inspired scoring.
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# Jinja2 is optional — falls back to string formatting
try:
    from jinja2 import Template
    _HAS_JINJA = True
except ImportError:
    _HAS_JINJA = False

REPORT_DIR = Path("reports")

_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Assessment Report — {{ timestamp }}</title>
<style>
  :root { --accent: #e63946; --bg: #0d1117; --card: #161b22; --text: #c9d1d9; --border: #30363d; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; padding: 2rem; }
  h1 { color: #fff; font-size: 1.8rem; border-bottom: 2px solid var(--accent); padding-bottom: .5rem; margin-bottom: 1.5rem; }
  h2 { color: #fff; font-size: 1.2rem; margin: 1.5rem 0 .75rem; }
  .meta { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
  .badge { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: .5rem 1rem; font-size: .9rem; }
  .badge span { color: var(--accent); font-weight: 700; font-size: 1.2rem; }
  .score-ring { display: inline-flex; align-items: center; justify-content: center;
    width: 90px; height: 90px; border-radius: 50%;
    border: 6px solid {{ score_color }}; font-size: 1.6rem; font-weight: 700; color: #fff; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
  th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid var(--border); font-size: .9rem; }
  th { background: var(--card); color: #fff; }
  .red { color: #e63946; } .green { color: #2ea043; }
  .timeline { list-style: none; }
  .timeline li { padding: .4rem 0; border-left: 2px solid var(--accent); padding-left: 1rem; margin-bottom: .4rem; font-size: .85rem; }
  .narrative { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    padding: 1.2rem; line-height: 1.7; white-space: pre-wrap; font-size: .9rem; }
  .section { display: grid; gap: 1rem; }
  @media (min-width: 700px) { .section { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<h1>Security Assessment Report</h1>
<div class="meta">
  <div class="badge">Target <br><span>{{ target }}</span></div>
  <div class="badge">Date <br><span>{{ timestamp }}</span></div>
  <div class="badge">Security Score <br>
    <div class="score-ring">{{ security_score }}</div>
  </div>
  <div class="badge">Risk Level <br><span style="color:{{ score_color }}">{{ risk_level }}</span></div>
  <div class="badge">Episodes <br><span>{{ episodes }}</span></div>
</div>

<h2>Per-Task Scores</h2>
<table>
  <tr><th>Task</th><th>Red Team (Attack)</th><th>Blue Team (Defence)</th><th>Winner</th></tr>
  {% for row in task_rows %}
  <tr>
    <td>{{ row.task }}</td>
    <td class="red">{{ "%.3f"|format(row.red) }}</td>
    <td class="green">{{ "%.3f"|format(row.blue) }}</td>
    <td><strong>{{ row.winner }}</strong></td>
  </tr>
  {% endfor %}
</table>

<div class="section">
  <div>
    <h2>Attack Timeline</h2>
    <ul class="timeline">
      {% for event in timeline %}
      <li>{{ event }}</li>
      {% endfor %}
    </ul>
  </div>
  <div>
    <h2>Agent Learning Progress</h2>
    <table>
      <tr><th>Metric</th><th>Red Team</th><th>Blue Team</th></tr>
      {% for row in stats_rows %}
      <tr><td>{{ row.label }}</td><td>{{ row.red }}</td><td>{{ row.blue }}</td></tr>
      {% endfor %}
    </table>
  </div>
</div>

<h2>AI-Generated Assessment</h2>
<div class="narrative">{{ narrative }}</div>

</body>
</html>"""


def _risk_level(score: int) -> tuple[str, str]:
    if score >= 80: return "LOW", "#2ea043"
    if score >= 60: return "MEDIUM", "#e3b341"
    if score >= 40: return "HIGH", "#f0883e"
    return "CRITICAL", "#e63946"


def generate(
    red_scores: Dict[str, float],
    episode_count: int,
    attack_timeline: List[str],
    red_stats: Dict,
    blue_stats: Dict,
    narrative: str = "",
    target: str = "Simulated Corporate Network",
) -> Path:
    """Generate and save an HTML report, returns the file path."""
    blue_scores = {k: round(1 - v, 3) for k, v in red_scores.items()}
    overall_red = sum(red_scores.values()) / max(len(red_scores), 1)
    security_score = round((1 - overall_red) * 100)
    risk_level, score_color = _risk_level(security_score)

    task_rows = []
    for k in ("stealth_recon", "precision_exploit", "flag_capture"):
        r, b = red_scores.get(k, 0.0), blue_scores.get(k, 0.0)
        task_rows.append({
            "task": k.replace("_", " ").title(),
            "red": r, "blue": b,
            "winner": "Red Team" if r > b else "Blue Team" if b > r else "Draw",
        })

    stats_rows = [
        {"label": "Episodes trained", "red": red_stats.get("episodes", 0), "blue": blue_stats.get("episodes", 0)},
        {"label": "Avg reward (last 20)", "red": red_stats.get("avg_reward_last20", 0), "blue": blue_stats.get("avg_reward_last20", 0)},
        {"label": "Exploration rate", "red": red_stats.get("exploration_rate", 0), "blue": blue_stats.get("exploration_rate", 0)},
    ]

    if not narrative:
        narrative = (
            f"Executive Summary\n"
            f"The target network achieved a security score of {security_score}/100 ({risk_level} risk).\n\n"
            f"Technical Findings\n"
            f"The Red Team achieved {overall_red*100:.1f}% average attack success.\n\n"
            f"Recommendations\n"
            f"Focus on hardening services identified during the stealth recon phase.\n"
            f"Note: Enable LLM (Ollama) for detailed AI-generated analysis."
        )

    if _HAS_JINJA:
        html = Template(_TEMPLATE).render(
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            target=target,
            security_score=security_score,
            risk_level=risk_level,
            score_color=score_color,
            episodes=episode_count,
            task_rows=task_rows,
            timeline=attack_timeline[:20],
            stats_rows=stats_rows,
            narrative=narrative,
        )
    else:
        html = f"<html><body><h1>Score: {security_score}/100</h1><pre>{narrative}</pre></body></html>"

    REPORT_DIR.mkdir(exist_ok=True)
    fname = REPORT_DIR / f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    fname.write_text(html, encoding="utf-8")
    return fname

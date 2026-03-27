"""
Episode Memory Store — SQLite-backed episodic memory for both agents.

Agents query this store before each episode to retrieve the LLM-generated
strategy from their most recent debrief, enabling genuine "learning from
past mistakes" without external training infrastructure.
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

DB_PATH = Path("agents/memory/episodes.db")


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(str(DB_PATH))


def init_db() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS episodes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                role        TEXT NOT NULL,
                timestamp   TEXT NOT NULL,
                episode_num INTEGER,
                scores      TEXT,        -- JSON
                mistakes    TEXT,        -- JSON list
                strategy    TEXT,        -- LLM debrief
                avg_reward  REAL
            )
        """)
        con.commit()


def save_episode(
    role: str,
    episode_num: int,
    scores: Dict[str, float],
    mistakes: List[str],
    strategy: str,
    avg_reward: float,
) -> None:
    with _conn() as con:
        con.execute(
            """INSERT INTO episodes
               (role, timestamp, episode_num, scores, mistakes, strategy, avg_reward)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                role,
                datetime.now().isoformat(),
                episode_num,
                json.dumps(scores),
                json.dumps(mistakes),
                strategy,
                avg_reward,
            ),
        )
        con.commit()


def get_latest_strategy(role: str) -> Optional[str]:
    """Return the most recent LLM-generated strategy for this role."""
    with _conn() as con:
        row = con.execute(
            "SELECT strategy FROM episodes WHERE role=? ORDER BY id DESC LIMIT 1",
            (role,),
        ).fetchone()
    return row[0] if row else None


def get_recent_episodes(role: str, n: int = 10) -> List[Dict]:
    """Return the last n episodes for this role."""
    with _conn() as con:
        rows = con.execute(
            """SELECT episode_num, timestamp, scores, avg_reward, strategy
               FROM episodes WHERE role=? ORDER BY id DESC LIMIT ?""",
            (role, n),
        ).fetchall()
    return [
        {
            "episode": r[0],
            "timestamp": r[1],
            "scores": json.loads(r[2]) if r[2] else {},
            "avg_reward": r[3],
            "strategy": r[4],
        }
        for r in rows
    ]


def get_reward_history(role: str, n: int = 100) -> List[float]:
    with _conn() as con:
        rows = con.execute(
            "SELECT avg_reward FROM episodes WHERE role=? ORDER BY id DESC LIMIT ?",
            (role, n),
        ).fetchall()
    return [r[0] for r in reversed(rows)]


# Ensure DB is initialised when module is imported
init_db()

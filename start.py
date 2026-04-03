#!/usr/bin/env python3
"""
start.py — One-command launcher for the RvsB platform.

Starts the unified FastAPI application on port 7860 which includes:
  1. OpenEnv root endpoints (/reset, /step)
  2. Dashboard API (/api/*)
  3. React UI static files (/)
"""
import argparse
import os
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).parent
PROCS = []

def run(cmd: list, cwd=None, env=None, label=""):
    p = subprocess.Popen(
        cmd, cwd=cwd or ROOT,
        env={**os.environ, **(env or {})},
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )
    PROCS.append((label, p))
    return p

def stop_all(*_):
    print("\nStopping services...")
    for label, p in PROCS:
        try:
            if sys.platform == "win32":
                p.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                p.terminate()
        except: pass
    sys.exit(0)

signal.signal(signal.SIGINT, stop_all)
signal.signal(signal.SIGTERM, stop_all)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-ui", action="store_true", help="Compile React UI before starting")
    args = parser.parse_args()

    if args.build_ui:
        import shutil
        npm = shutil.which("npm") or ("npm.cmd" if sys.platform == "win32" else "npm")
        print("Building React UI (Sentinel Core)...")
        subprocess.run([npm, "install"], cwd=ROOT / "ui" / "sentinel-core")
        subprocess.run([npm, "run", "build"], cwd=ROOT / "ui" / "sentinel-core")

    path_sep = ";" if sys.platform == "win32" else ":"
    src_env = {"PYTHONPATH": f"{ROOT}{path_sep}{ROOT / 'src'}"}
    print("Starting RvsB Unified Server on http://localhost:7860 ...")
    run(
        [sys.executable, "-m", "uvicorn",
         "envs.rvsb_env.server.app:app",
         "--host", "0.0.0.0", "--port", "7860", "--reload",
         "--reload-dir", str(ROOT / "src"),
        ],
        cwd=ROOT / "src",
        env=src_env,
        label="Server",
    )

    time.sleep(2)
    print("\n" + "=" * 50)
    print("  RvsB Platform Running (HF Space Mode)")
    print("  Dashboard UI ->  http://localhost:7860/")
    print("  API Docs     ->  http://localhost:7860/docs")
    print("=" * 50 + "\n")

    webbrowser.open("http://localhost:7860/")

    try:
        PROCS[0][1].wait()
    except KeyboardInterrupt:
        stop_all()

if __name__ == "__main__":
    main()

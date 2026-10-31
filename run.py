#!/usr/bin/env python3
"""One command to run Spin & Solve (SQLite API + web app).

    python run.py            install (if needed) -> tests -> start API + dev server
    python run.py --no-test  skip the tests
    python run.py --test     install -> tests only
    python run.py --build    production build + preview server instead of dev server
    python run.py --install  force a fresh dependency install first

Game:     http://localhost:8080      (the port Vite prints below)
Teacher:  <game address>/teacher     (hidden page, passcode: admin)
Database: data/spin_solve.db         (SQLite — back this file up to keep your questions)
"""
import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API_PORT = int(os.environ.get("SPIN_API_PORT", "8787"))
DATA_DIR = Path(os.environ.get("SPIN_DATA_DIR", ROOT / "data"))


def say(msg):
    print(f"\n==> {msg}", flush=True)


def run(cmd, check=True):
    print("   $", " ".join(map(str, cmd)), flush=True)
    return subprocess.run(cmd, cwd=ROOT, check=check, shell=(os.name == "nt")).returncode


def package_manager():
    """Prefer bun (the repo ships bun.lock); fall back to npm."""
    if shutil.which("bun"):
        return "bun"
    if shutil.which("npm"):
        return "npm"
    sys.exit("Neither bun nor npm found. Install Node.js from https://nodejs.org and try again.")


def install(pm, force):
    if (ROOT / "node_modules").is_dir() and not force:
        say("Dependencies already installed (use --install to redo)")
        return
    say(f"Installing dependencies with {pm}")
    if pm == "bun":
        run(["bun", "install"])
    elif run(["npm", "install", "--no-audit", "--no-fund"], check=False) != 0:
        say("npm hit a peer-dependency conflict, retrying with --legacy-peer-deps")
        run(["npm", "install", "--legacy-peer-deps", "--no-audit", "--no-fund"])


def run_tests(pm):
    say("Running API tests (SQLite)")
    if run([sys.executable, "-m", "unittest", "server/test_server.py"], check=False) != 0:
        sys.exit("API tests failed — fix them or rerun with --no-test.")
    say("Running web tests")
    if run([pm, "run", "test"], check=False) != 0:
        sys.exit("Web tests failed — fix them or rerun with --no-test.")


def port_in_use(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_api():
    if port_in_use(API_PORT):
        try:
            import json
            info = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{API_PORT}/api/health", timeout=1).read())
            old = info.get("version", 0) < 3
        except Exception:
            old = True
        if old:
            sys.exit(f"An older Spin & Solve server (or another program) is still using port {API_PORT}.\n"
                     "Close every old Spin & Solve / python window, or restart the computer, then run this again.\n"
                     "(Otherwise the teacher passcode 'admin' and the new features won't work.)")
        sys.exit(f"Spin & Solve is already running in another window (port {API_PORT}). Use that one, or close it first.")
    say("Starting the SQLite API")
    proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "server.py")], cwd=ROOT)
    for _ in range(50):
        if proc.poll() is not None:
            sys.exit("The API failed to start (see the error above).")
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{API_PORT}/api/game", timeout=1).read()
            break
        except Exception:
            time.sleep(0.1)
    else:
        proc.terminate()
        sys.exit("The API did not respond in time.")

    if os.environ.get("TEACHER_PASSCODE"):
        code = "(from the TEACHER_PASSCODE environment variable)"
    else:
        code = "admin"
    print(f"\n   Teacher page : /teacher   (not linked anywhere in the game)")
    print(f"   Passcode     : {code}\n", flush=True)
    return proc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-test", action="store_true", help="skip tests")
    ap.add_argument("--test", action="store_true", help="run tests only, then exit")
    ap.add_argument("--build", action="store_true", help="production build + preview instead of dev server")
    ap.add_argument("--install", action="store_true", help="force dependency install")
    args = ap.parse_args()

    pm = package_manager()
    install(pm, args.install)

    if args.test or not args.no_test:
        run_tests(pm)
        if args.test:
            return

    if args.build:
        say("Building for production")
        run([pm, "run", "build"])

    api = start_api()
    os.environ["SPIN_PYTHON_API"] = "1"  # tells vite.config.ts to forward /api to the Python server
    try:
        say("Starting the web app — open the URL shown below (Ctrl+C to stop)")
        run([pm, "run", "preview" if args.build else "dev"])
    except (KeyboardInterrupt, subprocess.CalledProcessError):
        print("\nStopped.")
    finally:
        api.terminate()
        api.wait()


if __name__ == "__main__":
    main()

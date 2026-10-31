#!/usr/bin/env python3
"""Spin & Solve API — SQLite storage for students and questions. Standard library only.

Public (the game screen):
  GET  /api/game                      eligible students + all questions
Teacher (header  X-Teacher-Passcode):
  POST   /api/teacher/check           verify the passcode
  GET    /api/teacher/data            every student + question
  POST   /api/teacher/students        {"names": [...], "is_sample": false}
  PATCH  /api/teacher/students/<id>   {"eligible": true|false}
  DELETE /api/teacher/students/<id>
  POST   /api/teacher/questions       {"questions": [...], "is_sample": false}   each question may carry "round": 1|2
  PATCH  /api/teacher/questions/<id>  {"round": 1|2}
  DELETE /api/teacher/questions/<id>

Teacher passcode: "admin" (set env TEACHER_PASSCODE to use a different one).
"""
import hmac
import json
import os
import re
import sqlite3
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("SPIN_DATA_DIR", ROOT / "data"))
DB_PATH = Path(os.environ.get("SPIN_DB", DATA_DIR / "spin_solve.db"))
HOST = os.environ.get("SPIN_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("SPIN_API_PORT", "8787"))

MAX_BODY = 1_000_000
MAX_BULK = 500
LOCK_AFTER_FAILS = 8
LOCK_SECONDS = 60

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  eligible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,            -- JSON array of 2-4 strings
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  round INTEGER NOT NULL DEFAULT 1,  -- which quiz round asks it: 1 or 2
  created_at TEXT NOT NULL
);
"""

_db_lock = threading.Lock()
_fails = {}  # ip -> (count, first_fail_time)


def now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    # Older databases: add the round column; existing questions become Round 1.
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(questions)")}
    if "round" not in cols:
        conn.execute("ALTER TABLE questions ADD COLUMN round INTEGER NOT NULL DEFAULT 1")
        conn.commit()
    return conn


DB = connect()


DEFAULT_PASSCODE = "admin"
API_VERSION = 3  # bump when the API changes; older copies have no /api/health


def load_passcode():
    return os.environ.get("TEACHER_PASSCODE", "").strip() or DEFAULT_PASSCODE


PASSCODE = load_passcode()


def student_row(r):
    return {"id": r["id"], "name": r["name"], "is_sample": bool(r["is_sample"]),
            "eligible": bool(r["eligible"]), "created_at": r["created_at"]}


def question_row(r):
    return {"id": r["id"], "prompt": r["prompt"], "options": json.loads(r["options"]),
            "correct_index": r["correct_index"], "explanation": r["explanation"],
            "is_sample": bool(r["is_sample"]), "round": r["round"], "created_at": r["created_at"]}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


def clean_text(value, field, limit):
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{field} is required")
    value = value.strip()
    if len(value) > limit:
        raise ApiError(400, f"{field} is too long (max {limit} characters)")
    return value


def validate_question(q):
    if not isinstance(q, dict):
        raise ApiError(400, "Each question must be an object")
    prompt = clean_text(q.get("prompt"), "Question", 500)
    options = q.get("options")
    if not isinstance(options, list) or not 2 <= len(options) <= 4:
        raise ApiError(400, "A question needs 2 to 4 options")
    options = [clean_text(o, "Option", 200) for o in options]
    idx = q.get("correct_index")
    if not isinstance(idx, int) or isinstance(idx, bool) or not 0 <= idx < len(options):
        raise ApiError(400, "correct_index must point at one of the options")
    explanation = q.get("explanation") or ""
    if not isinstance(explanation, str) or len(explanation) > 1000:
        raise ApiError(400, "Explanation is too long (max 1000 characters)")
    return prompt, options, idx, explanation.strip(), clean_round(q.get("round", 1))


def clean_round(value):
    if value not in (1, 2) or isinstance(value, bool):
        raise ApiError(400, "round must be 1 or 2")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "SpinSolveAPI/1.0"

    def log_message(self, fmt, *args):  # quiet; errors still surface via exceptions
        pass

    # ---- plumbing -------------------------------------------------------
    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "Bad Content-Length")
        if length > MAX_BODY:
            raise ApiError(413, "Request too large")
        if length == 0:
            return {}
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            raise ApiError(400, "Body must be JSON")
        if not isinstance(data, dict):
            raise ApiError(400, "Body must be a JSON object")
        return data

    def require_teacher(self):
        ip = self.client_address[0]
        count, first = _fails.get(ip, (0, 0.0))
        if count >= LOCK_AFTER_FAILS and time.time() - first < LOCK_SECONDS:
            raise ApiError(429, "Too many wrong passcodes. Wait a minute and try again.")
        if count and time.time() - first >= LOCK_SECONDS:
            count, first = 0, 0.0
        # Forgiving about case and stray spaces ("Admin", "admin ") — phone and tablet
        # keyboards often capitalise the first letter on their own.
        given = self.headers.get("X-Teacher-Passcode", "").strip().casefold()
        if not hmac.compare_digest(given.encode(), PASSCODE.strip().casefold().encode()):
            _fails[ip] = (count + 1, first or time.time())
            raise ApiError(401, "Wrong passcode")
        _fails.pop(ip, None)

    def dispatch(self, method):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        try:
            if method == "GET" and path == "/api/health":
                # Lets run.py and the teacher page tell this version apart from an old copy still running.
                return self.send_json(200, {"ok": True, "app": "spin-solve", "version": API_VERSION})
            if method == "GET" and path == "/api/game":
                return self.send_json(200, self.game())
            if path.startswith("/api/teacher"):
                self.require_teacher()
                return self.teacher(method, path)
            raise ApiError(404, "Not found")
        except ApiError as e:
            self.send_json(e.status, {"error": e.message})
        except Exception as e:  # never leak internals to the client
            print("API error:", repr(e), file=sys.stderr)
            self.send_json(500, {"error": "Server error"})

    do_GET = lambda self: self.dispatch("GET")
    do_POST = lambda self: self.dispatch("POST")
    do_PATCH = lambda self: self.dispatch("PATCH")
    do_DELETE = lambda self: self.dispatch("DELETE")

    # ---- handlers -------------------------------------------------------
    def game(self):
        with _db_lock:
            students = DB.execute("SELECT * FROM students WHERE eligible=1 ORDER BY name COLLATE NOCASE").fetchall()
            questions = DB.execute("SELECT * FROM questions ORDER BY round, created_at, rowid").fetchall()
        return {"students": [student_row(r) for r in students], "questions": [question_row(r) for r in questions]}

    def teacher(self, method, path):
        if method == "POST" and path == "/api/teacher/check":
            return self.send_json(200, {"ok": True})
        if method == "GET" and path == "/api/teacher/data":
            with _db_lock:
                students = DB.execute("SELECT * FROM students ORDER BY name COLLATE NOCASE").fetchall()
                questions = DB.execute("SELECT * FROM questions ORDER BY round, created_at, rowid").fetchall()
            return self.send_json(200, {"students": [student_row(r) for r in students],
                                        "questions": [question_row(r) for r in questions]})

        if method == "POST" and path == "/api/teacher/students":
            body = self.read_json()
            names = body.get("names")
            if not isinstance(names, list) or not names or len(names) > MAX_BULK:
                raise ApiError(400, f"Send 1 to {MAX_BULK} names")
            names = [clean_text(n, "Name", 60) for n in names]
            sample = 1 if body.get("is_sample") else 0
            with _db_lock, DB:
                DB.executemany("INSERT INTO students (id,name,is_sample,eligible,created_at) VALUES (?,?,?,1,?)",
                               [(str(uuid.uuid4()), n, sample, now()) for n in names])
            return self.send_json(201, {"added": len(names)})

        m = re.fullmatch(r"/api/teacher/students/([\w-]+)", path)
        if m and method == "PATCH":
            eligible = self.read_json().get("eligible")
            if not isinstance(eligible, bool):
                raise ApiError(400, "eligible must be true or false")
            with _db_lock, DB:
                cur = DB.execute("UPDATE students SET eligible=? WHERE id=?", (int(eligible), m.group(1)))
            if cur.rowcount == 0:
                raise ApiError(404, "Student not found")
            return self.send_json(200, {"ok": True})
        if m and method == "DELETE":
            with _db_lock, DB:
                cur = DB.execute("DELETE FROM students WHERE id=?", (m.group(1),))
            if cur.rowcount == 0:
                raise ApiError(404, "Student not found")
            return self.send_json(200, {"ok": True})

        if method == "POST" and path == "/api/teacher/questions":
            body = self.read_json()
            items = body.get("questions")
            if not isinstance(items, list) or not items or len(items) > MAX_BULK:
                raise ApiError(400, f"Send 1 to {MAX_BULK} questions")
            rows = [validate_question(q) for q in items]
            sample = 1 if body.get("is_sample") else 0
            with _db_lock, DB:
                DB.executemany(
                    "INSERT INTO questions (id,prompt,options,correct_index,explanation,is_sample,round,created_at)"
                    " VALUES (?,?,?,?,?,?,?,?)",
                    [(str(uuid.uuid4()), p, json.dumps(o), i, e, sample, rnd, now()) for p, o, i, e, rnd in rows])
            return self.send_json(201, {"added": len(rows)})

        m = re.fullmatch(r"/api/teacher/questions/([\w-]+)", path)
        if m and method == "PATCH":
            rnd = clean_round(self.read_json().get("round"))
            with _db_lock, DB:
                cur = DB.execute("UPDATE questions SET round=? WHERE id=?", (rnd, m.group(1)))
            if cur.rowcount == 0:
                raise ApiError(404, "Question not found")
            return self.send_json(200, {"ok": True})
        if m and method == "DELETE":
            with _db_lock, DB:
                cur = DB.execute("DELETE FROM questions WHERE id=?", (m.group(1),))
            if cur.rowcount == 0:
                raise ApiError(404, "Question not found")
            return self.send_json(200, {"ok": True})

        raise ApiError(404, "Not found")


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Spin & Solve API on http://{HOST}:{PORT}  (database: {DB_PATH})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

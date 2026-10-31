"""Run:  python -m unittest server/test_server.py -v"""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

PORT = 8799
BASE = f"http://127.0.0.1:{PORT}"
PASS = "test-pass"


def call(method, path, body=None, passcode=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if passcode:
        req.add_header("X-Teacher-Passcode", passcode)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        env = dict(os.environ, SPIN_DATA_DIR=cls.tmp.name, SPIN_API_PORT=str(PORT), TEACHER_PASSCODE=PASS)
        cls.proc = subprocess.Popen([sys.executable, str(Path(__file__).parent / "server.py")], env=env,
                                    stdout=subprocess.DEVNULL)
        for _ in range(50):
            try:
                call("GET", "/api/game")
                break
            except Exception:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait()
        cls.tmp.cleanup()

    def test_1_teacher_endpoints_need_passcode(self):
        self.assertEqual(call("GET", "/api/teacher/data")[0], 401)
        self.assertEqual(call("GET", "/api/teacher/data", passcode="nope")[0], 401)
        self.assertEqual(call("POST", "/api/teacher/check", {}, PASS)[0], 200)

    def test_2_students_and_questions_round_trip(self):
        self.assertEqual(call("POST", "/api/teacher/students", {"names": ["Asha", "Ben"]}, PASS)[0], 201)
        q = {"prompt": "Letter after C?", "options": ["B", "D", "E"], "correct_index": 1, "explanation": "C, D"}
        self.assertEqual(call("POST", "/api/teacher/questions", {"questions": [q]}, PASS)[0], 201)
        status, game = call("GET", "/api/game")
        self.assertEqual(status, 200)
        self.assertEqual([s["name"] for s in game["students"]], ["Asha", "Ben"])
        self.assertEqual(game["questions"][0]["options"], ["B", "D", "E"])

    def test_3_ineligible_students_hidden_from_game(self):
        _, data = call("GET", "/api/teacher/data", passcode=PASS)
        ben = next(s for s in data["students"] if s["name"] == "Ben")
        self.assertEqual(call("PATCH", f"/api/teacher/students/{ben['id']}", {"eligible": False}, PASS)[0], 200)
        _, game = call("GET", "/api/game")
        self.assertNotIn("Ben", [s["name"] for s in game["students"]])
        self.assertEqual(call("DELETE", f"/api/teacher/students/{ben['id']}", None, PASS)[0], 200)

    def test_4_rejects_bad_questions(self):
        bad = {"prompt": "x", "options": ["a", "b"], "correct_index": 5}
        self.assertEqual(call("POST", "/api/teacher/questions", {"questions": [bad]}, PASS)[0], 400)
        self.assertEqual(call("POST", "/api/teacher/students", {"names": [""]}, PASS)[0], 400)


    def test_6_passcode_ignores_case_and_spaces(self):
        for given in ["TEST-PASS", " test-pass ", "Test-Pass"]:
            self.assertEqual(call("POST", "/api/teacher/check", {}, given)[0], 200, given)
        self.assertEqual(call("GET", "/api/health")[1]["app"], "spin-solve")

    def test_5_questions_belong_to_a_round(self):
        q = {"prompt": "Round two question", "options": ["A", "B"], "correct_index": 0, "round": 2}
        self.assertEqual(call("POST", "/api/teacher/questions", {"questions": [q]}, PASS)[0], 201)
        _, game = call("GET", "/api/game")
        by_prompt = {x["prompt"]: x for x in game["questions"]}
        self.assertEqual(by_prompt["Round two question"]["round"], 2)
        self.assertEqual(by_prompt["Letter after C?"]["round"], 1)  # no round given -> Round 1
        qid = by_prompt["Round two question"]["id"]
        self.assertEqual(call("PATCH", f"/api/teacher/questions/{qid}", {"round": 1}, PASS)[0], 200)
        self.assertEqual(call("PATCH", f"/api/teacher/questions/{qid}", {"round": 3}, PASS)[0], 400)
        bad = dict(q, round="2")
        self.assertEqual(call("POST", "/api/teacher/questions", {"questions": [bad]}, PASS)[0], 400)


if __name__ == "__main__":
    unittest.main()

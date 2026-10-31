// Thin client for the SQLite-backed API in server/server.py (proxied at /api by Vite).
import type { Question, Student } from "@/lib/game";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  passcode?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(passcode ? { "X-Teacher-Passcode": passcode } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("Can't reach the game server. Is `python run.py` still running?", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError((data as { error?: string }).error ?? "Request failed", res.status);
  return data as T;
}

export interface GameData {
  students: Student[];
  questions: Question[];
}

export interface NewQuestion {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  round: 1 | 2;
}

export const api = {
  loadGame: () => request<GameData>("GET", "/game"),
  /** Where the server keeps data; `temporary` = the host wipes it on restart (Render free plan). */
  health: () =>
    request<{ app?: string; version?: number; storage?: string; temporary?: boolean }>(
      "GET",
      "/health",
    ),
  /** False when the server answering is an older copy of the game (it has no /api/health). */
  isCurrentServer: () =>
    request<{ app?: string; version?: number }>("GET", "/health")
      .then((h) => h.app === "spin-solve" && (h.version ?? 0) >= 3)
      .catch(() => false),

  // Teacher — every call carries the passcode.
  checkPasscode: (pass: string) => request<{ ok: true }>("POST", "/teacher/check", {}, pass),
  teacherData: (pass: string) => request<GameData>("GET", "/teacher/data", undefined, pass),
  addStudents: (pass: string, names: string[], isSample = false) =>
    request<{ added: number }>("POST", "/teacher/students", { names, is_sample: isSample }, pass),
  setEligible: (pass: string, id: string, eligible: boolean) =>
    request<{ ok: true }>("PATCH", `/teacher/students/${id}`, { eligible }, pass),
  deleteStudent: (pass: string, id: string) =>
    request<{ ok: true }>("DELETE", `/teacher/students/${id}`, undefined, pass),
  addQuestions: (pass: string, questions: NewQuestion[], isSample = false) =>
    request<{ added: number }>(
      "POST",
      "/teacher/questions",
      { questions, is_sample: isSample },
      pass,
    ),
  setQuestionRound: (pass: string, id: string, round: 1 | 2) =>
    request<{ ok: true }>("PATCH", `/teacher/questions/${id}`, { round }, pass),
  deleteQuestion: (pass: string, id: string) =>
    request<{ ok: true }>("DELETE", `/teacher/questions/${id}`, undefined, pass),
};

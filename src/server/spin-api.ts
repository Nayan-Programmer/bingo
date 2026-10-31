// Spin & Solve API built into the web app, so it also runs where Python can't (e.g. Vercel).
// Same endpoints and rules as server/server.py:
//
//   GET    /api/health                  {"ok", "app", "version"}
//   GET    /api/game                    eligible students + all questions
//   Teacher (header X-Teacher-Passcode — "admin" unless TEACHER_PASSCODE is set; case/space-insensitive):
//   POST   /api/teacher/check
//   GET    /api/teacher/data
//   POST   /api/teacher/students        {"names": [...], "is_sample": false}
//   PATCH  /api/teacher/students/<id>   {"eligible": true|false}
//   DELETE /api/teacher/students/<id>
//   POST   /api/teacher/questions       {"questions": [...], "is_sample": false}   each may carry "round": 1|2
//   PATCH  /api/teacher/questions/<id>  {"round": 1|2}
//   DELETE /api/teacher/questions/<id>
//
// Pure logic: storage is passed in, so it is unit-tested with an in-memory store.

export const API_VERSION = 3;
const DEFAULT_PASSCODE = "admin";
const MAX_BULK = 500;
const LOCK_AFTER_FAILS = 8;
const LOCK_MS = 60_000;

export interface StoredStudent {
  id: string;
  name: string;
  is_sample: boolean;
  eligible: boolean;
  created_at: string;
}

export interface StoredQuestion {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  is_sample: boolean;
  round: 1 | 2;
  created_at: string;
}

export interface SpinData {
  students: StoredStudent[];
  questions: StoredQuestion[];
}

export interface SpinStore {
  load(): Promise<SpinData>;
  save(data: SpinData): Promise<void>;
}

/** Storage that can't be used, with a message for the teacher (e.g. Vercel without a database connected). */
export class StoreUnavailable extends Error {}

export interface ApiRequest {
  method: string;
  /** e.g. "/api/teacher/students/123" */
  path: string;
  passcodeHeader: string | null;
  /** Client address, for the wrong-passcode lockout. */
  ip: string;
  body: unknown;
}

export interface ApiResult {
  status: number;
  json: unknown;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const fails = new Map<string, { count: number; first: number }>();

/** Wipe the lockout memory (tests). */
export function resetLockouts(): void {
  fails.clear();
}

function normalisePass(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function requireTeacher(req: ApiRequest, passcode: string): void {
  const now = Date.now();
  let entry = fails.get(req.ip) ?? { count: 0, first: 0 };
  if (entry.count >= LOCK_AFTER_FAILS && now - entry.first < LOCK_MS) {
    throw new ApiError(429, "Too many wrong passcodes. Wait a minute and try again.");
  }
  if (entry.count && now - entry.first >= LOCK_MS) entry = { count: 0, first: 0 };
  if (normalisePass(req.passcodeHeader ?? "") !== normalisePass(passcode)) {
    fails.set(req.ip, { count: entry.count + 1, first: entry.first || now });
    throw new ApiError(401, "Wrong passcode");
  }
  fails.delete(req.ip);
}

function cleanText(value: unknown, field: string, limit: number): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${field} is required`);
  const v = value.trim();
  if (v.length > limit) throw new ApiError(400, `${field} is too long (max ${limit} characters)`);
  return v;
}

function cleanRound(value: unknown): 1 | 2 {
  if (value !== 1 && value !== 2) throw new ApiError(400, "round must be 1 or 2");
  return value;
}

function validateQuestion(q: unknown): Omit<StoredQuestion, "id" | "is_sample" | "created_at"> {
  if (!q || typeof q !== "object" || Array.isArray(q))
    throw new ApiError(400, "Each question must be an object");
  const o = q as {
    prompt?: unknown;
    options?: unknown;
    correct_index?: unknown;
    explanation?: unknown;
    round?: unknown;
  };
  const prompt = cleanText(o.prompt, "Question", 500);
  if (!Array.isArray(o.options) || o.options.length < 2 || o.options.length > 4) {
    throw new ApiError(400, "A question needs 2 to 4 options");
  }
  const options = o.options.map((x) => cleanText(x, "Option", 200));
  const idx = o.correct_index;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= options.length) {
    throw new ApiError(400, "correct_index must point at one of the options");
  }
  const explanation = o.explanation ?? "";
  if (typeof explanation !== "string" || explanation.length > 1000) {
    throw new ApiError(400, "Explanation is too long (max 1000 characters)");
  }
  return {
    prompt,
    options,
    correct_index: idx,
    explanation: explanation.trim(),
    round: cleanRound(o.round ?? 1),
  };
}

interface Body {
  names?: unknown;
  is_sample?: unknown;
  eligible?: unknown;
  questions?: unknown;
  round?: unknown;
}

function asObject(body: unknown): Body {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object" || Array.isArray(body))
    throw new ApiError(400, "Body must be a JSON object");
  return body as Body;
}

const byName = (a: StoredStudent, b: StoredStudent) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const byRoundThenAge = (a: StoredQuestion, b: StoredQuestion) =>
  a.round - b.round || a.created_at.localeCompare(b.created_at);

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export async function handleApi(
  req: ApiRequest,
  store: SpinStore,
  passcode: string = DEFAULT_PASSCODE,
  /** Extra facts for /api/health, e.g. where data is stored. */
  healthExtra: Record<string, unknown> = {},
): Promise<ApiResult> {
  const path = req.path.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();
  try {
    if (method === "GET" && path === "/api/health") {
      return {
        status: 200,
        json: { ok: true, app: "spin-solve", version: API_VERSION, ...healthExtra },
      };
    }
    if (method === "GET" && path === "/api/game") {
      const data = await store.load();
      return {
        status: 200,
        json: {
          students: data.students.filter((s) => s.eligible).sort(byName),
          questions: [...data.questions].sort(byRoundThenAge),
        },
      };
    }
    if (!path.startsWith("/api/teacher")) throw new ApiError(404, "Not found");

    requireTeacher(req, passcode);

    if (method === "POST" && path === "/api/teacher/check")
      return { status: 200, json: { ok: true } };

    const data = await store.load();
    const now = new Date().toISOString();

    if (method === "GET" && path === "/api/teacher/data") {
      return {
        status: 200,
        json: {
          students: [...data.students].sort(byName),
          questions: [...data.questions].sort(byRoundThenAge),
        },
      };
    }

    if (method === "POST" && path === "/api/teacher/students") {
      const body = asObject(req.body);
      const names = body.names;
      if (!Array.isArray(names) || names.length === 0 || names.length > MAX_BULK) {
        throw new ApiError(400, `Send 1 to ${MAX_BULK} names`);
      }
      const clean = names.map((n) => cleanText(n, "Name", 60));
      const sample = Boolean(body.is_sample);
      data.students.push(
        ...clean.map((name) => ({
          id: newId(),
          name,
          is_sample: sample,
          eligible: true,
          created_at: now,
        })),
      );
      await store.save(data);
      return { status: 201, json: { added: clean.length } };
    }

    let m = /^\/api\/teacher\/students\/([\w-]+)$/.exec(path);
    if (m) {
      const id = m[1];
      const student = data.students.find((s) => s.id === id);
      if (method === "PATCH") {
        const eligible = asObject(req.body).eligible;
        if (typeof eligible !== "boolean")
          throw new ApiError(400, "eligible must be true or false");
        if (!student) throw new ApiError(404, "Student not found");
        student.eligible = eligible;
        await store.save(data);
        return { status: 200, json: { ok: true } };
      }
      if (method === "DELETE") {
        if (!student) throw new ApiError(404, "Student not found");
        data.students = data.students.filter((s) => s.id !== id);
        await store.save(data);
        return { status: 200, json: { ok: true } };
      }
    }

    if (method === "POST" && path === "/api/teacher/questions") {
      const body = asObject(req.body);
      const items = body.questions;
      if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BULK) {
        throw new ApiError(400, `Send 1 to ${MAX_BULK} questions`);
      }
      const rows = items.map(validateQuestion);
      const sample = Boolean(body.is_sample);
      // Keep the given order inside one batch even when timestamps tie.
      const base = Date.now();
      data.questions.push(
        ...rows.map((r, i) => ({
          id: newId(),
          ...r,
          is_sample: sample,
          created_at: new Date(base + i).toISOString(),
        })),
      );
      await store.save(data);
      return { status: 201, json: { added: rows.length } };
    }

    m = /^\/api\/teacher\/questions\/([\w-]+)$/.exec(path);
    if (m) {
      const id = m[1];
      const question = data.questions.find((q) => q.id === id);
      if (method === "PATCH") {
        const round = cleanRound(asObject(req.body).round);
        if (!question) throw new ApiError(404, "Question not found");
        question.round = round;
        await store.save(data);
        return { status: 200, json: { ok: true } };
      }
      if (method === "DELETE") {
        if (!question) throw new ApiError(404, "Question not found");
        data.questions = data.questions.filter((q) => q.id !== id);
        await store.save(data);
        return { status: 200, json: { ok: true } };
      }
    }

    throw new ApiError(404, "Not found");
  } catch (err) {
    if (err instanceof ApiError) return { status: err.status, json: { error: err.message } };
    if (err instanceof StoreUnavailable) return { status: 503, json: { error: err.message } };
    console.error("API error:", err);
    return { status: 500, json: { error: "Server error" } };
  }
}

export function emptyData(): SpinData {
  return { students: [], questions: [] };
}

/** In-memory store (tests). */
export function memoryStore(initial: SpinData = emptyData()): SpinStore & { data: SpinData } {
  const s = {
    data: structuredClone(initial),
    load: async () => structuredClone(s.data),
    save: async (d: SpinData) => {
      s.data = structuredClone(d);
    },
  };
  return s;
}

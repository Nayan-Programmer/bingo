// Where the built-in API keeps students and questions.
//  - Vercel / any host with Upstash Redis connected: KV_REST_API_URL + KV_REST_API_TOKEN
//    (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) — one JSON document.
//  - Running locally without Redis: data/spin_solve.json next to the project.
//  - On Vercel without Redis: a clear message telling the teacher how to connect it.
import { emptyData, StoreUnavailable, type SpinData, type SpinStore } from "./spin-api";

const KEY = "spin-solve:data";

export const CONNECT_STORAGE_HELP =
  "No database connected. In Vercel open this project → Storage → Create Database → Upstash for Redis → Connect, then Redeploy.";

function env(name: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

function normalise(raw: unknown): SpinData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<SpinData>;
  return {
    students: Array.isArray(d.students) ? d.students : [],
    questions: Array.isArray(d.questions)
      ? d.questions.map((q) => ({ ...q, round: q.round === 2 ? 2 : 1 }))
      : [],
  };
}

export function upstashStore(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): SpinStore {
  const call = async (command: (string | number)[]) => {
    const res = await fetchImpl(url.replace(/\/+$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    const out = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || out.error) {
      throw new StoreUnavailable(
        `Database error: ${out.error ?? `HTTP ${res.status}`}. Check the Upstash store in Vercel.`,
      );
    }
    return out.result;
  };
  return {
    async load() {
      const result = await call(["GET", KEY]);
      return typeof result === "string" ? normalise(JSON.parse(result)) : emptyData();
    },
    async save(data) {
      await call(["SET", KEY, JSON.stringify(data)]);
    },
  };
}

function fileStore(): SpinStore {
  const file = () => `${process.cwd()}/data/spin_solve.json`;
  return {
    async load() {
      const fs = await import("node:fs/promises");
      try {
        return normalise(JSON.parse(await fs.readFile(file(), "utf8")));
      } catch {
        return emptyData();
      }
    },
    async save(data) {
      const fs = await import("node:fs/promises");
      await fs.mkdir(`${process.cwd()}/data`, { recursive: true });
      await fs.writeFile(file(), JSON.stringify(data, null, 2));
    },
  };
}

function unavailableStore(message: string): SpinStore {
  return {
    load: () => Promise.reject(new StoreUnavailable(message)),
    save: () => Promise.reject(new StoreUnavailable(message)),
  };
}

export interface StorageInfo {
  storage: "redis" | "file" | "none";
  /** true when saved data will be wiped by the host (e.g. Render free plan restarts). */
  temporary: boolean;
}

export function storageInfo(): StorageInfo {
  if (
    (env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL")) &&
    (env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN"))
  ) {
    return { storage: "redis", temporary: false };
  }
  if (env("VERCEL")) return { storage: "none", temporary: false };
  return { storage: "file", temporary: Boolean(env("RENDER")) };
}

export function pickStore(): SpinStore {
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) return upstashStore(url, token);
  if (env("VERCEL")) {
    // "Redis" (Redis Cloud) only gives REDIS_URL, which a serverless page can't use over HTTP.
    return unavailableStore(
      env("REDIS_URL")
        ? "This Redis database can't be used here. In Vercel → Storage, create an 'Upstash for Redis' database instead, connect it, then Redeploy."
        : CONNECT_STORAGE_HELP,
    );
  }
  return fileStore();
}

export function teacherPasscode(): string {
  return env("TEACHER_PASSCODE") ?? "admin";
}

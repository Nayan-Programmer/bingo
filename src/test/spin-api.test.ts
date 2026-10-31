import { beforeEach, describe, expect, it } from "vitest";
import { handleApi, memoryStore, resetLockouts, type ApiRequest } from "@/server/spin-api";
import { upstashStore } from "@/server/stores";

const req = (
  method: string,
  path: string,
  body?: unknown,
  pass: string | null = "admin",
): ApiRequest => ({
  method,
  path,
  passcodeHeader: pass,
  ip: "1.2.3.4",
  body,
});

describe("built-in API (Vercel)", () => {
  beforeEach(() => resetLockouts());

  it("health + passcode admin, any case", async () => {
    const store = memoryStore();
    expect((await handleApi(req("GET", "/api/health"), store)).json).toMatchObject({
      app: "spin-solve",
      version: 3,
    });
    expect((await handleApi(req("POST", "/api/teacher/check", {}, "Admin "), store)).status).toBe(
      200,
    );
    expect((await handleApi(req("POST", "/api/teacher/check", {}, "nope"), store)).status).toBe(
      401,
    );
    expect((await handleApi(req("GET", "/api/teacher/data", undefined, null), store)).status).toBe(
      401,
    );
  });

  it("locks out after 8 wrong passcodes", async () => {
    const store = memoryStore();
    for (let i = 0; i < 8; i++)
      await handleApi(req("POST", "/api/teacher/check", {}, "bad"), store);
    expect((await handleApi(req("POST", "/api/teacher/check", {}, "admin"), store)).status).toBe(
      429,
    );
  });

  it("students and questions round trip, with rounds", async () => {
    const store = memoryStore();
    expect(
      (await handleApi(req("POST", "/api/teacher/students", { names: ["Ben", "asha"] }), store))
        .status,
    ).toBe(201);
    const q = { prompt: "Letter after C?", options: ["B", "D"], correct_index: 1 };
    await handleApi(
      req("POST", "/api/teacher/questions", { questions: [q, { ...q, prompt: "R2", round: 2 }] }),
      store,
    );
    const game = (await handleApi(req("GET", "/api/game"), store)).json as {
      students: { name: string; id: string }[];
      questions: { prompt: string; round: number; id: string }[];
    };
    expect(game.students.map((s) => s.name)).toEqual(["asha", "Ben"]);
    expect(game.questions.map((x) => [x.prompt, x.round])).toEqual([
      ["Letter after C?", 1],
      ["R2", 2],
    ]);
    const r2 = game.questions[1]!.id;
    expect(
      (await handleApi(req("PATCH", `/api/teacher/questions/${r2}`, { round: 1 }), store)).status,
    ).toBe(200);
    expect(
      (await handleApi(req("PATCH", `/api/teacher/questions/${r2}`, { round: 3 }), store)).status,
    ).toBe(400);
    const ben = game.students.find((s) => s.name === "Ben")!.id;
    await handleApi(req("PATCH", `/api/teacher/students/${ben}`, { eligible: false }), store);
    const after = (await handleApi(req("GET", "/api/game"), store)).json as {
      students: { name: string }[];
    };
    expect(after.students.map((s) => s.name)).toEqual(["asha"]);
    expect((await handleApi(req("DELETE", `/api/teacher/students/${ben}`), store)).status).toBe(
      200,
    );
    expect((await handleApi(req("DELETE", `/api/teacher/students/${ben}`), store)).status).toBe(
      404,
    );
  });

  it("rejects bad input", async () => {
    const store = memoryStore();
    const bad = { prompt: "x", options: ["a", "b"], correct_index: 5 };
    expect(
      (await handleApi(req("POST", "/api/teacher/questions", { questions: [bad] }), store)).status,
    ).toBe(400);
    expect(
      (await handleApi(req("POST", "/api/teacher/students", { names: [""] }), store)).status,
    ).toBe(400);
    expect((await handleApi(req("GET", "/api/nope"), store)).status).toBe(404);
  });

  it("stores everything in Upstash Redis as one document", async () => {
    const redis = new Map<string, string>();
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const [cmd, key, value] = JSON.parse(String(init.body)) as string[];
      if (cmd === "SET") redis.set(key!, value!);
      const result = cmd === "GET" ? (redis.get(key!) ?? null) : "OK";
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = upstashStore("https://example.upstash.io", "t", fakeFetch);
    expect(await store.load()).toEqual({ students: [], questions: [] });
    await handleApi(req("POST", "/api/teacher/students", { names: ["Diya"] }), store);
    expect(JSON.parse(redis.get("spin-solve:data")!).students[0].name).toBe("Diya");
  });
});

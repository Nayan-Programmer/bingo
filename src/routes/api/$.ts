import { createFileRoute } from "@tanstack/react-router";

// Every /api/* request is answered here (built-in server: works on Vercel and with `npm run dev`).
// `python run.py` instead forwards /api to server/server.py — same endpoints, same rules.
async function handle(request: Request): Promise<Response> {
  const [{ handleApi }, { pickStore, teacherPasscode, storageInfo }] = await Promise.all([
    import("@/server/spin-api"),
    import("@/server/stores"),
  ]);
  const url = new URL(request.url);
  let body: unknown = undefined;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const text = await request.text();
    if (text.length > 1_000_000)
      return Response.json({ error: "Request too large" }, { status: 413 });
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: "Body must be JSON" }, { status: 400 });
      }
    }
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const result = await handleApi(
    {
      method: request.method,
      path: url.pathname,
      passcodeHeader: request.headers.get("x-teacher-passcode"),
      ip,
      body,
    },
    pickStore(),
    teacherPasscode(),
    { ...storageInfo() },
  );
  return Response.json(result.json, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PATCH: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
});

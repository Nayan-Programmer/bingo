// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// `python run.py` runs the SQLite API (server/server.py) beside the web app and sets SPIN_PYTHON_API=1,
// so /api is forwarded there. Without it (plain `npm run dev`, Vercel) the built-in API in
// src/routes/api/$.ts answers instead.
const usePythonApi = process.env["SPIN_PYTHON_API"] === "1";
const apiProxy = usePythonApi
  ? {
      "/api": {
        target: `http://127.0.0.1:${process.env["SPIN_API_PORT"] ?? 8787}`,
        changeOrigin: false,
      },
    }
  : undefined;

// Hosting (Render, Railway, a school server…): accept any address the site is opened on, and use
// the port the host gives in $PORT. Without this, Vite answers "Blocked request. This host … is not allowed".
const hostPort = process.env["PORT"] ? Number(process.env["PORT"]) : undefined;
const hosting = {
  allowedHosts: true as const,
  ...(hostPort ? { port: hostPort, strictPort: true } : {}),
};

export default defineConfig({
  vite: {
    server: { ...hosting, ...(apiProxy ? { proxy: apiProxy } : {}) },
    preview: { ...hosting, ...(apiProxy ? { proxy: apiProxy } : {}) },
  },
  // Render (and `npm run build:node`) needs a plain Node server: `npm start` runs it.
  // Everywhere else the defaults stay (Vercel is detected automatically).
  ...(process.env["RENDER"] || process.env["SPIN_NODE_BUILD"]
    ? { nitro: { preset: "node-server" } }
    : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

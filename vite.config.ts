/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Zero transmission, enforced by the browser: the built page may only load and
 * fetch files from its own origin. Any request to another site (an analytics
 * script, an LLM API, a CDN) is blocked, not just avoided.
 * 'wasm-unsafe-eval' lets DuckDB-WASM compile its (self-hosted) WebAssembly.
 * Build only: the dev server needs inline scripts and a websocket for HMR.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" },
      { tag: "meta", attrs: { name: "referrer", content: "no-referrer" }, injectTo: "head-prepend" },
    ],
  };
}

// GitHub Pages serves project sites under /<repo>/.
// Override with BASE_PATH=/ for a user/org site or a custom domain.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/StrategusUI/",
  plugins: [react(), contentSecurityPolicy()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

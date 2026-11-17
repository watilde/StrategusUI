import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "../vite.config";

const directives = Object.fromEntries(
  CONTENT_SECURITY_POLICY.split(";").map((d) => {
    const [name, ...values] = d.trim().split(/\s+/);
    return [name, values];
  }),
);

describe("Content-Security-Policy (zero transmission)", () => {
  it("only allows connections to this site", () => {
    expect(directives["connect-src"]).toEqual(["'self'"]);
    expect(directives["default-src"]).toEqual(["'none'"]);
  });
  it("only runs this site's scripts and workers (WebAssembly allowed, eval not)", () => {
    expect(directives["script-src"]).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(directives["worker-src"]).toEqual(["'self'"]);
  });
  it("never allows wildcards, other origins or inline code", () => {
    const all = Object.values(directives).flat();
    expect(all.filter((v) => v === "*" || /^https?:/.test(v) || v === "'unsafe-inline'" || v === "'unsafe-eval'")).toEqual([]);
    expect(directives["form-action"]).toEqual(["'none'"]);
  });
});

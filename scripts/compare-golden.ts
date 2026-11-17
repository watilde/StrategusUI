/**
 * Compares fixtures/out/<name>/spec.ts.json with spec.r.json for every fixture.
 * Exits non-zero on any semantic difference.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareSpecs } from "../src/compiler/equivalence";

const outRoot = join(import.meta.dirname, "..", "fixtures", "out");
let failed = false;

for (const name of readdirSync(outRoot)) {
  const dir = join(outRoot, name);
  const tsPath = join(dir, "spec.ts.json");
  const rPath = join(dir, "spec.r.json");
  if (!existsSync(tsPath) || !existsSync(rPath)) {
    console.error(`✗ ${name}: missing ${existsSync(tsPath) ? "spec.r.json" : "spec.ts.json"}`);
    failed = true;
    continue;
  }
  const ts = JSON.parse(readFileSync(tsPath, "utf8"));
  const r = JSON.parse(readFileSync(rPath, "utf8"));
  const diffs = compareSpecs(ts, r);

  const versionNote = (spec: { moduleSpecifications?: { module: string; modulePackageVersion: string }[] }) =>
    (spec.moduleSpecifications ?? []).map((m) => `${m.module}@${m.modulePackageVersion}`).join(", ");
  if (versionNote(ts) !== versionNote(r)) {
    console.warn(`! ${name}: package versions differ (TS templates: ${versionNote(ts)} / R: ${versionNote(r)}). Consider regenerating templates.`);
  }

  if (diffs.length === 0) {
    console.log(`✓ ${name}: TypeScript output matches R golden output`);
  } else {
    failed = true;
    console.error(`✗ ${name}: ${diffs.length} difference(s)`);
    for (const d of diffs.slice(0, 50)) {
      console.error(`  ${d.path}\n    ts: ${JSON.stringify(d.ts)}\n    r:  ${JSON.stringify(d.r)}`);
    }
  }
}

process.exit(failed ? 1 : 0);

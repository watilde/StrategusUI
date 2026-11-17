/**
 * Writes one fixture directory per preset IR:
 *   fixtures/out/<name>/ir.json
 *   fixtures/out/<name>/cohorts/<cohortId>.json
 *   fixtures/out/<name>/spec.ts.json   (TypeScript compiler output)
 *
 * r/build-golden.R then adds spec.r.json next to them.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES as PRESETS } from "../src/ir/presets/fixtures";
import { buildAnalysisSpecifications, cohortDefinitionFiles } from "../src/compiler/strategus";
import { templates } from "../src/compiler/templates";
import { buildRScriptFrom } from "../src/compiler/rScript";

const outRoot = join(import.meta.dirname, "..", "fixtures", "out");
const rSource = readFileSync(join(import.meta.dirname, "..", "r", "strategus-from-ir.R"), "utf8");
const templatesReady = Object.keys(templates.cmAnalyses).length > 0;

for (const [name, ir] of Object.entries(PRESETS)) {
  const dir = join(outRoot, name);
  // Keep spec.r.json / packages.json from a previous R run; refresh everything we own.
  rmSync(join(dir, "cohorts"), { recursive: true, force: true });
  rmSync(join(dir, "spec.ts.json"), { force: true });
  mkdirSync(join(dir, "cohorts"), { recursive: true });
  writeFileSync(join(dir, "ir.json"), JSON.stringify(ir, null, 2));
  for (const [id, json] of Object.entries(cohortDefinitionFiles(ir))) {
    writeFileSync(join(dir, "cohorts", `${id}.json`), json);
  }
  let spec: string | null = null;
  try {
    spec = templatesReady ? JSON.stringify(buildAnalysisSpecifications(ir), null, 2) : null;
  } catch (e) {
    // e.g. a module template that has not been extracted yet (bootstrap).
    console.warn(`  ${name}: no spec.ts.json (${(e as Error).message})`);
  }
  if (spec) {
    writeFileSync(join(dir, "spec.ts.json"), spec);
    // The script users download from the UI; CI runs it to check it works end to end.
    writeFileSync(join(dir, "CreateAnalysisSpecification.R"), buildRScriptFrom(rSource, ir));
  }
  console.log(`wrote ${dir}${templatesReady ? "" : " (no spec.ts.json: templates not generated yet)"}`);
}

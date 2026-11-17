/**
 * Regenerates src/compiler/templates/cm-templates.json from the R golden output
 * of the "allPresets" fixture (which enables every CohortMethod preset).
 *
 *   npm run fixtures:export
 *   Rscript r/build-golden.R fixtures/out/allPresets
 *   npm run templates:extract
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allPresets } from "../src/ir/presets/fixtures";
import type { JsonObject, Templates } from "../src/compiler/templates";

const root = join(import.meta.dirname, "..");
const fixtureDir = join(root, "fixtures", "out", "allPresets");
const spec = JSON.parse(readFileSync(join(fixtureDir, "spec.r.json"), "utf8")) as JsonObject;
const packages = JSON.parse(readFileSync(join(fixtureDir, "packages.json"), "utf8")) as Record<string, string>;

const modules = spec.moduleSpecifications as JsonObject[];
const findModule = (name: string) => {
  const m = modules.find((x) => x.module === name);
  if (!m) throw new Error(`Module ${name} not found in R output`);
  return m;
};
const identity = (m: JsonObject) => ({
  modulePackage: String(m.modulePackage),
  modulePackageVersion: String(m.modulePackageVersion),
  modulePackageHash: String(m.modulePackageHash),
});

const cg = findModule("CohortGeneratorModule");
const cd = findModule("CohortDiagnosticsModule");
const cm = findModule("CohortMethodModule");
const cmSpecs = (cm.settings as JsonObject).cmAnalysesSpecifications as JsonObject;
const analysisList = cmSpecs.cmAnalysisList as JsonObject[];

const presetNames = allPresets.cohortMethod.analyses;
if (analysisList.length !== presetNames.length) {
  throw new Error(`Expected ${presetNames.length} analyses, R produced ${analysisList.length}`);
}
const cmAnalyses = Object.fromEntries(presetNames.map((name, i) => [name, analysisList[i]])) as Templates["cmAnalyses"];

// Everything except the study-specific lists is kept as the top-level template.
const { cmAnalysisList: _a, targetComparatorOutcomesList: _t, ...cmAnalysesSpecifications } = cmSpecs;

const templates: Templates = {
  source: {
    generatedBy: "r/strategus-from-ir.R via scripts/extract-templates.ts",
    generatedAt: new Date().toISOString(),
    packages,
  },
  strategus: {
    strategusVersion: String(spec.strategusVersion),
    strategusPackageHash: String(spec.strategusPackageHash),
  },
  modules: {
    CohortGeneratorModule: identity(cg),
    CohortMethodModule: identity(cm),
    CohortDiagnosticsModule: identity(cd),
  },
  cohortDiagnosticsSettings: cd.settings as JsonObject,
  cmAnalysesSpecifications,
  cmAnalyses,
};

const out = join(root, "src", "compiler", "templates", "cm-templates.json");
writeFileSync(out, JSON.stringify(templates, null, 2) + "\n");
console.log(`wrote ${out}`);

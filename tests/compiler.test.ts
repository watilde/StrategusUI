import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gibleed } from "../src/ir/presets/gibleed";
import { FIXTURES as PRESETS } from "../src/ir/presets/fixtures";
import { buildAnalysisSpecifications, excludedCovariateConceptIds } from "../src/compiler/strategus";
import { compareSpecs } from "../src/compiler/equivalence";
import { buildRScript, rRawString } from "../src/compiler/rScriptBundled";
import { toCirceExpression } from "../src/cohorts/circe";

const golden = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "golden", `${name}.spec.r.json`), "utf8"));

describe("TypeScript compiler vs R golden output", () => {
  // The golden files are produced by r/build-golden.R (official Strategus /
  // CohortMethod APIs) and committed. CI regenerates them from fresh R packages.
  for (const [name, ir] of Object.entries(PRESETS)) {
    it(`${name} matches the R output`, () => {
      const diffs = compareSpecs(buildAnalysisSpecifications(ir), golden(name));
      expect(diffs).toEqual([]);
    });
  }
});

describe("buildAnalysisSpecifications", () => {
  const spec = buildAnalysisSpecifications(gibleed) as any;
  const cm = () => spec.moduleSpecifications.find((m: any) => m.module === "CohortMethodModule").settings.cmAnalysesSpecifications;

  it("emits CohortGenerator, CohortDiagnostics (when enabled), then CohortMethod", () => {
    expect(spec.moduleSpecifications.map((m: any) => m.module)).toEqual(["CohortGeneratorModule", "CohortDiagnosticsModule", "CohortMethodModule"]);
    const without = buildAnalysisSpecifications({ ...gibleed, cohortDiagnostics: { enabled: false } }) as any;
    expect(without.moduleSpecifications.map((m: any) => m.module)).toEqual(["CohortGeneratorModule", "CohortMethodModule"]);
    expect(spec.attr_class).toBe("AnalysisSpecifications");
  });

  it("puts negative controls before outcomes of interest", () => {
    const tco = cm().targetComparatorOutcomesList[0];
    const outcomes = tco.outcomes as any[];
    expect(outcomes.at(-1)).toMatchObject({ outcomeId: 3, outcomeOfInterest: true });
    expect(outcomes.filter((o) => !o.outcomeOfInterest)).toHaveLength(gibleed.negativeControls.length);
  });

  it("derives excluded covariates from target and comparator when not given", () => {
    expect(excludedCovariateConceptIds(gibleed)).toEqual([1118084, 1124300]);
  });

  it("numbers analyses in IR order", () => {
    const list = cm().cmAnalysisList;
    expect(list.map((a: any) => a.analysisId)).toEqual([1, 2]);
    expect(list[1].matchOnPsArgs).not.toBeNull();
  });

  it("stores cohort definitions as Circe JSON strings", () => {
    const def = spec.sharedResources[0].cohortDefinitions[0].cohortDefinition;
    expect(typeof def).toBe("string");
    expect(JSON.parse(def).PrimaryCriteria.CriteriaList[0]).toHaveProperty("DrugEra");
  });
});

describe("Circe templates", () => {
  it("uses a custom drug era end strategy for drug cohorts", () => {
    expect(toCirceExpression(gibleed.target).EndStrategy).toEqual({
      CustomEra: { DrugCodesetId: 0, GapDays: 30, Offset: 0 },
    });
  });
  it("uses condition occurrence for outcome cohorts", () => {
    const expr = toCirceExpression(gibleed.outcomes[0]) as any;
    expect(expr.PrimaryCriteria.CriteriaList[0]).toHaveProperty("ConditionOccurrence");
  });
});

describe("compareSpecs", () => {
  it("tolerates R serialization quirks", () => {
    expect(compareSpecs({ a: [5], b: null, c: 1 }, { a: 5, b: [], c: "  1" })).toEqual([]);
  });
  it("reports real differences", () => {
    expect(compareSpecs({ a: 1, b: { c: "x" } }, { a: 2, b: { c: "y" } }).map((d) => d.path)).toEqual(["$.a", "$.b.c"]);
  });
  it("compares cohort definitions as parsed JSON", () => {
    expect(compareSpecs({ cohortDefinition: '{"x":1}' }, { cohortDefinition: '{ "x" : 1 }' })).toEqual([]);
  });
});

describe("buildRScript", () => {
  const script = buildRScript(gibleed, "2026-01-01T00:00:00Z");
  it("embeds the shared R builder and the IR", () => {
    expect(script).toContain("buildSpecFromIr <- function(ir, cohortJson)");
    expect(script).toContain('"irVersion": "0.1"');
    expect(script).toContain("analysisSpecifications <- buildSpecFromIr(ir, cohortJson)");
  });
  it("picks a raw-string delimiter that does not occur in the payload", () => {
    expect(rRawString("plain")).toBe('r"-(plain)-"');
    expect(rRawString('has )-" inside')).toBe('r"--(has )-" inside)--"');
  });
});

describe("phenotype outcomes", () => {
  it("embeds the published Circe definition unchanged", async () => {
    const { variant } = await import("../src/ir/presets/fixtures");
    const outcome = variant.outcomes.find((o) => o.kind === "phenotype")!;
    const spec = buildAnalysisSpecifications(variant) as any;
    const def = spec.sharedResources[0].cohortDefinitions.find((c: any) => c.cohortId === outcome.cohortId);
    expect(JSON.parse(def.cohortDefinition)).toEqual(outcome.kind === "phenotype" ? outcome.circe : null);
  });
});

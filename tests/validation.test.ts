import { describe, expect, it } from "vitest";
import { StudyIRSchema, studyIRJsonSchema, type StudyIR } from "../src/ir/schema";
import { PRESETS, gibleed } from "../src/ir/presets/gibleed";
import { hasErrors, validateStudy } from "../src/validate/semantic";
import { EUNOMIA_CONCEPTS } from "../src/vocab/eunomia";

const errorsOf = (ir: StudyIR) => validateStudy(ir).filter((i) => i.level === "error").map((i) => i.path);

describe("IR schema", () => {
  it("accepts every preset", () => {
    for (const ir of Object.values(PRESETS)) expect(StudyIRSchema.safeParse(ir).success).toBe(true);
  });
  it("rejects malformed dates and unknown presets", () => {
    expect(StudyIRSchema.safeParse({ ...gibleed, population: { ...gibleed.population, studyStartDate: "2010-01-01" } }).success).toBe(false);
    expect(StudyIRSchema.safeParse({ ...gibleed, cohortMethod: { analyses: ["magic"] } }).success).toBe(false);
  });
  it("exports a JSON Schema (for LLM prompts in step 3)", () => {
    const schema = studyIRJsonSchema() as any;
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("target");
  });
});

describe("semantic validation", () => {
  it("passes the GiBleed demo without errors", () => {
    expect(hasErrors(validateStudy(gibleed))).toBe(false);
  });
  it("flags duplicate cohort IDs", () => {
    expect(errorsOf({ ...gibleed, comparator: { ...gibleed.comparator, cohortId: 1 } })).toContain("comparator");
  });
  it("flags target == comparator", () => {
    expect(errorsOf({ ...gibleed, comparator: { ...gibleed.target, cohortId: 99 } })).toContain("comparator");
  });
  it("flags concepts from the wrong domain", () => {
    const bad = { ...gibleed, target: { ...gibleed.target, concepts: [EUNOMIA_CONCEPTS.giHemorrhage] } };
    expect(errorsOf(bad)).toContain("target.concepts[0]");
  });
  it("flags an inverted time-at-risk", () => {
    expect(errorsOf({ ...gibleed, timeAtRisk: { ...gibleed.timeAtRisk, riskWindowStart: 10, riskWindowEnd: 5, endAnchor: "cohort start" } })).toContain("timeAtRisk");
  });
  it("flags a negative control that equals an outcome", () => {
    const ncs = [...gibleed.negativeControls, { cohortId: 20000, name: "GI", outcomeConceptId: 192671 }];
    expect(errorsOf({ ...gibleed, negativeControls: ncs })).toContain(`negativeControls[${ncs.length - 1}]`);
  });
  it("warns when there are no negative controls", () => {
    const issues = validateStudy({ ...gibleed, negativeControls: [] });
    expect(issues.some((i) => i.level === "warning" && i.path === "negativeControls")).toBe(true);
  });
});

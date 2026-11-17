import { describe, expect, it } from "vitest";
import { EXAMPLE_DRAFT, QUESTION_PLACEHOLDER, buildFixPrompt, buildPrompt, buildRepairPrompt, extractJson, fixableIssues, parseDraft } from "../src/llm/prompt";
import { StudyIRSchema, draftConcepts, draftStudyIRJsonSchema, isResolved, withPlaceholderConcepts, type DraftStudyIR } from "../src/ir/schema";
import type { Issue } from "../src/validate/semantic";
import { InMemoryVocabulary, type CompactVocabulary } from "../src/vocab/eunomiaSource";
import { toConceptRef } from "../src/vocab/types";
import { buildAnalysisSpecifications } from "../src/compiler/strategus";
import { validateStudy, hasErrors } from "../src/validate/semantic";
import data from "../src/vocab/eunomia-vocab.json";

const example = JSON.stringify(EXAMPLE_DRAFT, null, 2);

describe("buildPrompt", () => {
  it("embeds the question, rules, schema and example", () => {
    const p = buildPrompt("Does drug A cause B?");
    expect(p).toContain("Does drug A cause B?");
    expect(p).toContain("NEVER write concept IDs");
    expect(p).toContain('"$defs"');
    expect(p).toContain('"conceptName": "celecoxib"');
    expect(p).not.toContain(QUESTION_PLACEHOLDER);
  });
  it("uses a placeholder when no question is given (downloadable template)", () => {
    expect(buildPrompt()).toContain(QUESTION_PLACEHOLDER);
    expect(buildPrompt("   ")).toContain(QUESTION_PLACEHOLDER);
  });
  it("stays small: the schema is minified", () => {
    const p = buildPrompt();
    expect(p.length).toBeLessThan(10000);
    expect(p).toContain(JSON.stringify(draftStudyIRJsonSchema()));
  });
  it("puts the rules and the question last, so truncating the start keeps them", () => {
    const p = buildPrompt("QUESTION-MARKER");
    const tail = p.slice(-Math.round(p.length * 0.25));
    expect(tail).toContain("## Rules");
    expect(tail).toContain("NEVER write concept IDs");
    expect(p.lastIndexOf("QUESTION-MARKER")).toBeGreaterThan(p.indexOf("## Rules"));
    expect(p.indexOf("## JSON Schema")).toBeLessThan(p.indexOf("## Rules"));
  });
  it("uses well-formed code fences", () => {
    expect(buildPrompt().match(/```json\n/g)).toHaveLength(2);
  });
});

describe("LLM JSON Schema", () => {
  const schema = draftStudyIRJsonSchema() as any;
  it("only allows unresolved concepts", () => {
    expect(schema.$defs.Concept.properties.conceptId).toMatchObject({ type: "null" });
  });
  it("keeps field descriptions", () => {
    expect(schema.$defs.Concept.properties.conceptName.description).toMatch(/RxNorm/);
  });
  it("accepts the example draft", () => {
    expect(parseDraft(example)).toMatchObject({ ok: true });
  });
});

describe("extractJson / parseDraft", () => {
  it("handles code fences and surrounding prose", () => {
    const reply = `Sure! Here is the study:\n\n\`\`\`json\n${example}\n\`\`\`\n\nLet me know if you need changes.`;
    expect(JSON.parse(extractJson(reply)).title).toBe(EXAMPLE_DRAFT.title);
    expect(parseDraft(reply).ok).toBe(true);
  });
  it("handles a bare object with leading text", () => {
    expect(parseDraft(`Result: ${JSON.stringify(EXAMPLE_DRAFT)}`).ok).toBe(true);
  });
  it("reports invalid JSON", () => {
    const r = parseDraft('{"title": "x",}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Not valid JSON/);
  });
  it("reports schema errors with paths", () => {
    const bad = { ...EXAMPLE_DRAFT, design: "sccs", timeAtRisk: { ...EXAMPLE_DRAFT.timeAtRisk, startAnchor: "index" } };
    const r = parseDraft(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith("design:"))).toBe(true);
      expect(r.errors.some((e) => e.startsWith("timeAtRisk.startAnchor:"))).toBe(true);
    }
  });
  it("accepts concepts with IDs too (checked later against the vocabulary)", () => {
    const withId = structuredClone(EXAMPLE_DRAFT) as any;
    withId.target.concepts = [
      { conceptId: 1118084, conceptName: "celecoxib", domainId: "Drug", vocabularyId: "RxNorm", includeDescendants: true },
    ];
    expect(parseDraft(JSON.stringify(withId)).ok).toBe(true);
  });
});

describe("buildRepairPrompt", () => {
  it("lists the problems and quotes the previous JSON", () => {
    const p = buildRepairPrompt(["design: Invalid input"], "```json\n{\"a\":1}\n```");
    expect(p).toContain("- design: Invalid input");
    expect(p).toContain('{"a":1}');
  });
});

describe("resolving a draft", () => {
  it("turns the example draft into a compilable study with the Eunomia vocabulary", async () => {
    const vocab = new InMemoryVocabulary(data as unknown as CompactVocabulary);
    const draft: DraftStudyIR = structuredClone(EXAMPLE_DRAFT);
    expect(StudyIRSchema.safeParse(draft).success).toBe(false);

    // Simulates a person taking the top candidate for each term.
    for (const cohort of [draft.target, draft.comparator, ...draft.outcomes]) {
      if (cohort.kind === "phenotype") continue;
      const domainId = cohort.kind === "drug_new_user" ? "Drug" : "Condition";
      for (let i = 0; i < cohort.concepts.length; i++) {
        const c = cohort.concepts[i];
        if (isResolved(c)) continue;
        const [top] = await vocab.search({ text: c.conceptName, domainId, limit: 1 });
        expect(top?.conceptName.toLowerCase()).toBe(c.conceptName.toLowerCase());
        cohort.concepts[i] = toConceptRef(top, c.includeDescendants);
      }
    }
    expect(draftConcepts(draft).every((x) => isResolved(x.concept))).toBe(true);
    const ir = StudyIRSchema.parse(draft);
    expect(hasErrors(validateStudy(ir))).toBe(false);
    expect((buildAnalysisSpecifications(ir).moduleSpecifications as { module: string }[]).map((m) => m.module)).toEqual([
      "CohortGeneratorModule",
      "CohortDiagnosticsModule",
      "CohortMethodModule",
    ]);
  });
});

describe("checks on unresolved drafts", () => {
  const check = (draft: DraftStudyIR) => validateStudy(StudyIRSchema.parse(withPlaceholderConcepts(draft)));

  it("finds study-level problems before concepts are matched", () => {
    const draft = structuredClone(EXAMPLE_DRAFT);
    draft.timeAtRisk = { ...draft.timeAtRisk, riskWindowStart: 30, riskWindowEnd: 0, endAnchor: "cohort start" };
    expect(check(draft).filter((i) => i.level === "error").map((i) => i.path)).toEqual(["timeAtRisk"]);
  });

  it("still detects the same term used for target and comparator", () => {
    const draft = structuredClone(EXAMPLE_DRAFT);
    draft.comparator = { ...draft.comparator, concepts: [{ conceptId: null, conceptName: "Celecoxib ", includeDescendants: true }] };
    expect(check(draft).some((i) => i.level === "error" && i.path === "comparator")).toBe(true);
  });

  it("raises no false alarms for the example", () => {
    expect(check(EXAMPLE_DRAFT).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("fix prompt", () => {
  const issues: Issue[] = [
    { level: "error", path: "timeAtRisk", message: "Time-at-risk ends before it starts", source: "study" },
    { level: "error", path: "target.concepts[0]", message: "not matched", source: "unresolved" },
    { level: "warning", path: "negativeControls", message: "No negative controls", source: "negative-controls" },
    { level: "warning", path: "target.concepts[0]", message: "name differs", source: "vocabulary" },
    { level: "info", path: "population", message: "fyi", source: "study" },
  ];

  it("sends only study and schema problems the LLM can fix", () => {
    expect(fixableIssues(issues).map((i) => i.path)).toEqual(["timeAtRisk"]);
  });

  it("includes the problems and the current IR, and asks to keep concepts", () => {
    const p = buildFixPrompt(issues, EXAMPLE_DRAFT);
    expect(p).toContain("- error at timeAtRisk: Time-at-risk ends before it starts");
    expect(p).not.toContain("No negative controls");
    expect(p).toContain("Keep every concept exactly as it is");
    expect(parseDraft(p.slice(p.indexOf("## Current Study IR"))).ok).toBe(true);
  });
});

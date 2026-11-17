import { DraftStudyIRSchema, IR_VERSION, draftStudyIRJsonSchema, type DraftStudyIR } from "../ir/schema";
import type { Issue } from "../validate/semantic";

/**
 * Copy-paste LLM harness.
 *
 * The app never calls an LLM. It produces a prompt the user pastes into any
 * LLM, then parses and validates what comes back. The LLM only drafts the IR:
 * concept IDs are left null and resolved against the vocabulary in the app,
 * negative controls are chosen later, and everything is checked before export.
 */

export const QUESTION_PLACEHOLDER = "<<< Replace this line with your research question or PICO >>>";

/** The GiBleed study as the LLM should write it: no concept IDs, no negative controls. */
export const EXAMPLE_DRAFT: DraftStudyIR = DraftStudyIRSchema.parse({
  irVersion: IR_VERSION,
  title: "Celecoxib vs diclofenac: GI bleed",
  description: "Time at risk is on-treatment (cohort start to cohort end).",
  design: "cohort_method",
  pico: {
    population: "Adults newly starting an NSAID",
    intervention: "Celecoxib",
    comparison: "Diclofenac",
    outcome: "Gastrointestinal bleeding",
  },
  target: {
    kind: "drug_new_user",
    cohortId: 1,
    name: "Celecoxib new users",
    concepts: [{ conceptId: null, conceptName: "celecoxib", includeDescendants: true }],
    eraGapDays: 30,
  },
  comparator: {
    kind: "drug_new_user",
    cohortId: 2,
    name: "Diclofenac new users",
    concepts: [{ conceptId: null, conceptName: "diclofenac", includeDescendants: true }],
    eraGapDays: 30,
  },
  outcomes: [
    {
      kind: "condition_first",
      cohortId: 3,
      name: "GI bleed",
      concepts: [{ conceptId: null, conceptName: "Gastrointestinal hemorrhage", includeDescendants: true }],
    },
  ],
  negativeControls: [],
  population: {
    washoutDays: 365,
    firstExposureOnly: true,
    removeDuplicateSubjects: "keep first",
    restrictToCommonPeriod: true,
    minAge: 18,
    maxAge: null,
    studyStartDate: "",
    studyEndDate: "",
    maxCohortSize: 0,
  },
  timeAtRisk: {
    riskWindowStart: 1,
    startAnchor: "cohort start",
    riskWindowEnd: 0,
    endAnchor: "cohort end",
    minDaysAtRisk: 1,
  },
  cohortMethod: { analyses: ["unadjusted", "ps_match_1to1"], excludedCovariateConceptIds: [] },
});

const RULES = `1. Reply with exactly one JSON object that validates against the JSON Schema below. No other text. A \`\`\`json code fence is fine.
2. Concepts: NEVER write concept IDs. For every concept use {"conceptId": null, "conceptName": "<term>", "includeDescendants": true}.
   - Drugs: the RxNorm ingredient name in English, lower case (e.g. "celecoxib", "metformin"). One concept per ingredient.
   - Conditions: the SNOMED-style English name (e.g. "Gastrointestinal hemorrhage", "Type 2 diabetes mellitus").
   The app looks these terms up in the OMOP vocabulary and a person confirms each match.
3. design is "cohort_method". target and comparator are "drug_new_user" cohorts; outcomes are "condition_first" cohorts.
4. cohortId: target 1, comparator 2, outcomes 3, 4, 5, ...
5. negativeControls: always []. They are selected later in the app.
6. cohortMethod.excludedCovariateConceptIds: always [].
7. Use these defaults unless the question says otherwise:
   - population: washoutDays 365, firstExposureOnly true, removeDuplicateSubjects "keep first", restrictToCommonPeriod true,
     minAge null (18 if the question says adults), maxAge null, studyStartDate "", studyEndDate "", maxCohortSize 0
   - timeAtRisk (on-treatment): riskWindowStart 1 "cohort start", riskWindowEnd 0 "cohort end", minDaysAtRisk 1
     For an intention-to-treat style question use riskWindowEnd 365 (or the stated follow-up) with endAnchor "cohort start".
   - cohortMethod.analyses: ["unadjusted", "ps_match_1to1"]
8. Fill pico with short phrases and give the study a short title.
9. If the question is ambiguous or cannot be fully expressed (for example no comparator is given), choose the most conventional option and explain it in "description".`;

/**
 * Layout: short task, reference material (schema, example), then the rules and
 * the research question last. Some runtimes (e.g. Ollama with its default
 * context length) silently drop the *beginning* of a long prompt; keeping the
 * question and rules at the end means they survive. The schema is minified to
 * keep the prompt short.
 */
export function buildPrompt(question?: string): string {
  const q = question?.trim() ? question.trim() : QUESTION_PLACEHOLDER;
  return `You are helping a clinical researcher draft an observational comparative cohort study for OHDSI Strategus (CohortGenerator + CohortMethod) on an OMOP CDM database. Turn the research question at the end of this message into a "Study IR" JSON object for Strategus UI. Reference material comes first; the rules and the question follow.

## JSON Schema of the Study IR

\`\`\`json
${JSON.stringify(draftStudyIRJsonSchema())}
\`\`\`

## Example

Question: "In adults, does celecoxib carry a different risk of gastrointestinal bleeding than diclofenac while on treatment?"

\`\`\`json
${JSON.stringify(EXAMPLE_DRAFT, null, 1)}
\`\`\`

## Rules

${RULES}

## Research question

${q}

Reply with the Study IR JSON object for this question only.
`;
}

/** Pulls the JSON object out of an LLM reply (code fences, leading prose, trailing text). */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

export type ParseResult = { ok: true; draft: DraftStudyIR } | { ok: false; errors: string[] };

export function parseDraft(text: string): ParseResult {
  if (!text.trim()) return { ok: false, errors: ["Nothing to load: paste the JSON the LLM returned."] };
  let json: unknown;
  try {
    json = JSON.parse(extractJson(text));
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const parsed = DraftStudyIRSchema.safeParse(json);
  if (parsed.success) return { ok: true, draft: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`),
  };
}

/** A follow-up prompt asking the LLM to fix the problems the app found. */
export function buildRepairPrompt(errors: string[], previous: string): string {
  return `The JSON you returned for Strategus UI is not valid. Fix these problems and reply with the corrected JSON object only, following the same rules and JSON Schema as before (concept IDs stay null, negativeControls stays []).

## Problems

${errors.map((e) => `- ${e}`).join("\n")}

## Your previous reply

\`\`\`json
${extractJson(previous)}
\`\`\`
`;
}

/**
 * Issues the LLM can fix by editing the study: schema and study-level problems.
 * Concept matching and negative controls are left to the person, so they are
 * not sent.
 */
export function fixableIssues(issues: Issue[]): Issue[] {
  return issues.filter((i) => (i.source === "study" || i.source === "schema") && i.level !== "info");
}

/** A follow-up prompt asking the LLM to revise a loaded study to address the app's checks. */
export function buildFixPrompt(issues: Issue[], ir: DraftStudyIR): string {
  const fixable = fixableIssues(issues);
  return `Strategus UI loaded your Study IR and its checks found problems. Revise the study to fix them and reply with the complete corrected JSON object only, following the same rules and JSON Schema as before.

Keep every concept exactly as it is, including any conceptId values: those were matched to the vocabulary by a person. A new concept must use "conceptId": null. Keep negativeControls exactly as they are.

## Problems

${fixable.map((i) => `- ${i.level}${i.path ? ` at ${i.path}` : ""}: ${i.message}`).join("\n")}

## Current Study IR

\`\`\`json
${JSON.stringify(ir, null, 1)}
\`\`\`
`;
}

import type { CohortSpec, StudyIR } from "../ir/schema";
import { excludedCovariateConceptIds, studyCohorts } from "../compiler/strategus";

/**
 * L2 semantic validation: rules that a JSON Schema cannot express.
 * "error" blocks export; "warning" and "info" are shown to the user.
 */
export type Issue = { level: "error" | "warning" | "info"; path: string; message: string };

const EXPECTED_DOMAIN: Record<CohortSpec["kind"], string> = {
  drug_new_user: "Drug",
  condition_first: "Condition",
};

function conceptKey(c: CohortSpec): string {
  return c.concepts
    .map((x) => `${x.conceptId}:${x.includeDescendants}`)
    .sort()
    .join(",");
}

export function validateStudy(ir: StudyIR): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], path: string, message: string) => issues.push({ level, path, message });

  // Cohort IDs must be unique across study cohorts and negative controls.
  const seen = new Map<number, string>();
  const register = (id: number, path: string) => {
    const prev = seen.get(id);
    if (prev) add("error", path, `cohortId ${id} is already used by ${prev}`);
    else seen.set(id, path);
  };
  register(ir.target.cohortId, "target");
  register(ir.comparator.cohortId, "comparator");
  ir.outcomes.forEach((o, i) => register(o.cohortId, `outcomes[${i}]`));
  ir.negativeControls.forEach((n, i) => register(n.cohortId, `negativeControls[${i}]`));

  if (conceptKey(ir.target) === conceptKey(ir.comparator)) {
    add("error", "comparator", "Target and comparator use the same concept set");
  }

  const cohortPaths: [CohortSpec, string][] = [
    [ir.target, "target"],
    [ir.comparator, "comparator"],
    ...ir.outcomes.map((o, i): [CohortSpec, string] => [o, `outcomes[${i}]`]),
  ];
  for (const [cohort, path] of cohortPaths) {
    const expected = EXPECTED_DOMAIN[cohort.kind];
    cohort.concepts.forEach((c, i) => {
      if (c.domainId !== expected) {
        add("error", `${path}.concepts[${i}]`, `${c.conceptName} (${c.conceptId}) is in the ${c.domainId} domain; ${cohort.kind} requires ${expected}`);
      }
      if (c.standardConcept !== "S") {
        add("warning", `${path}.concepts[${i}]`, `${c.conceptName} (${c.conceptId}) is not a standard concept`);
      }
    });
  }
  if (ir.target.kind !== "drug_new_user" || ir.comparator.kind !== "drug_new_user") {
    add("warning", "target", "In a new-user design, target and comparator are usually both drug cohorts");
  }

  // Time at risk
  const tar = ir.timeAtRisk;
  if (tar.startAnchor === tar.endAnchor && tar.riskWindowEnd < tar.riskWindowStart) {
    add("error", "timeAtRisk", "Time-at-risk ends before it starts");
  }
  if (tar.startAnchor === "cohort end" && tar.endAnchor === "cohort start") {
    add("error", "timeAtRisk", "A time-at-risk anchored from cohort end to cohort start is invalid");
  }

  // Population
  const p = ir.population;
  if (p.minAge !== null && p.maxAge !== null && p.minAge > p.maxAge) {
    add("error", "population", "minAge is greater than maxAge");
  }
  if (p.studyStartDate && p.studyEndDate && p.studyStartDate > p.studyEndDate) {
    add("error", "population", "studyStartDate is after studyEndDate");
  }

  // Negative controls
  if (ir.negativeControls.length === 0) {
    add("warning", "negativeControls", "No negative controls: empirical calibration and systematic error assessment will not be possible");
  } else if (ir.negativeControls.length < 5) {
    add("info", "negativeControls", `Only ${ir.negativeControls.length} negative controls; dozens are usually recommended for calibration`);
  }
  const outcomeConceptIds = new Set(ir.outcomes.flatMap((o) => o.concepts.map((c) => c.conceptId)));
  ir.negativeControls.forEach((n, i) => {
    if (outcomeConceptIds.has(n.outcomeConceptId)) {
      add("error", `negativeControls[${i}]`, `${n.name} uses the same concept as an outcome of interest`);
    }
  });

  // CohortMethod
  const analyses = ir.cohortMethod.analyses;
  if (new Set(analyses).size !== analyses.length) {
    add("error", "cohortMethod.analyses", "The same analysis preset is selected more than once");
  }
  if (analyses.every((a) => a === "unadjusted")) {
    add("warning", "cohortMethod.analyses", "No analysis adjusts for confounding with a propensity score");
  }
  const excluded = new Set(excludedCovariateConceptIds(ir));
  const exposureIds = [...ir.target.concepts, ...ir.comparator.concepts].map((c) => c.conceptId);
  const notExcluded = exposureIds.filter((id) => !excluded.has(id));
  if (notExcluded.length > 0) {
    add("warning", "cohortMethod.excludedCovariateConceptIds", `Exposure concepts ${notExcluded.join(", ")} are not excluded from covariates (the PS model may separate perfectly)`);
  }

  if (studyCohorts(ir).length + ir.negativeControls.length === 0) {
    add("error", "", "No cohorts defined");
  }
  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}

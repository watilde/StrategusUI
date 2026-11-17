import { IR_VERSION, StudyIRSchema, type StudyIR, type StudyIRInput } from "../schema";
import { EUNOMIA_CONCEPTS, EUNOMIA_NEGATIVE_CONTROLS } from "../../vocab/eunomia";

/**
 * Book of OHDSI ch.12 example, as used by the Strategus vignette:
 * risk of GI bleed in new users of celecoxib vs diclofenac.
 * Runs on the Eunomia GiBleed synthetic CDM.
 */
export const gibleedInput: StudyIRInput = {
  irVersion: IR_VERSION,
  title: "Celecoxib vs diclofenac: GI bleed (Eunomia demo)",
  description: "Book of OHDSI chapter 12 example study.",
  design: "cohort_method",
  pico: {
    population: "Patients newly starting an NSAID",
    intervention: "Celecoxib",
    comparison: "Diclofenac",
    outcome: "Gastrointestinal bleeding",
  },
  target: {
    kind: "drug_new_user",
    cohortId: 1,
    name: "Celecoxib",
    concepts: [EUNOMIA_CONCEPTS.celecoxib],
    eraGapDays: 30,
  },
  comparator: {
    kind: "drug_new_user",
    cohortId: 2,
    name: "Diclofenac",
    concepts: [EUNOMIA_CONCEPTS.diclofenac],
    eraGapDays: 30,
  },
  outcomes: [
    {
      kind: "condition_first",
      cohortId: 3,
      name: "GI bleed",
      concepts: [EUNOMIA_CONCEPTS.giHemorrhage],
    },
  ],
  negativeControls: EUNOMIA_NEGATIVE_CONTROLS,
  negativeControlSettings: {
    occurrenceType: "first",
    detectOnDescendants: true,
    priorOutcomeLookback: 30,
  },
  population: {
    washoutDays: 183,
    firstExposureOnly: true,
    removeDuplicateSubjects: "remove all",
    restrictToCommonPeriod: true,
    minAge: null,
    maxAge: null,
    studyStartDate: "",
    studyEndDate: "",
    maxCohortSize: 100000,
  },
  timeAtRisk: {
    riskWindowStart: 0,
    startAnchor: "cohort start",
    riskWindowEnd: 30,
    endAnchor: "cohort end",
    minDaysAtRisk: 1,
  },
  cohortMethod: {
    analyses: ["unadjusted", "ps_match_1to1"],
    excludedCovariateConceptIds: [],
  },
  cohortDiagnostics: { enabled: true },
};

export const gibleed: StudyIR = StudyIRSchema.parse(gibleedInput);

export const PRESETS = { gibleed } as const;

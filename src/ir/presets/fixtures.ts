import { StudyIRSchema, type StudyIR } from "../schema";
import { EUNOMIA_CONCEPTS } from "../../vocab/eunomia";
import { gibleed, gibleedInput } from "./gibleed";
import phenotype77 from "./phenotypes/77.json";

/**
 * Study IRs used as CI fixtures (TypeScript vs R golden output). Kept out of
 * the app bundle.
 */

/** Same study with every CM preset enabled; used to (re)generate templates from R. */
export const allPresets: StudyIR = StudyIRSchema.parse({
  ...gibleedInput,
  title: "All CohortMethod presets (template source)",
  cohortMethod: { analyses: ["unadjusted", "ps_match_1to1", "ps_stratify_10"], excludedCovariateConceptIds: [] },
  cohortDiagnostics: { enabled: true },
});

/**
 * Changes every IR-driven field (TAR, population, presets order, exclusions,
 * multiple outcomes, no negative controls) so CI exercises the compiler beyond
 * the template source.
 */
export const variant: StudyIR = StudyIRSchema.parse({
  ...gibleedInput,
  title: "Variant (compiler coverage)",
  target: { ...gibleedInput.target, eraGapDays: 0 },
  outcomes: [
    ...gibleedInput.outcomes,
    {
      kind: "condition_first",
      cohortId: 4,
      name: "GI bleed (exact concept)",
      concepts: [{ ...EUNOMIA_CONCEPTS.giHemorrhage, includeDescendants: false }],
    },
    {
      // OHDSI PhenotypeLibrary v3.37.0, cohort 77 (Apache License).
      kind: "phenotype",
      cohortId: 5,
      name: "GI bleeding with inpatient admission (PhenotypeLibrary 77)",
      phenotype: { library: "OHDSI PhenotypeLibrary", version: "3.37.0", id: 77, name: "Gastrointestinal bleeding with inpatient admission" },
      circe: phenotype77 as Record<string, unknown>,
    },
  ],
  negativeControls: [],
  population: {
    washoutDays: 365,
    firstExposureOnly: false,
    removeDuplicateSubjects: "keep first",
    restrictToCommonPeriod: false,
    minAge: 18,
    maxAge: 85,
    studyStartDate: "20100101",
    studyEndDate: "",
    maxCohortSize: 0,
  },
  timeAtRisk: {
    riskWindowStart: 1,
    startAnchor: "cohort start",
    riskWindowEnd: 365,
    endAnchor: "cohort start",
    minDaysAtRisk: 0,
  },
  cohortMethod: { analyses: ["ps_stratify_10", "unadjusted"], excludedCovariateConceptIds: [1118084] },
  cohortDiagnostics: { enabled: false },
});



export const FIXTURES = { gibleed, allPresets, variant } as const;

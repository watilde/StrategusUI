import type { ConceptRef, NegativeControl } from "../ir/schema";

/**
 * Tiny vocabulary subset for the Eunomia GiBleed demo.
 * Values are taken from the cohort definitions and negative control list that
 * ship with Strategus (inst/testdata), which are themselves redistributed
 * with the Eunomia example dataset.
 *
 * Step 2 replaces this with search over a user-provided Athena vocabulary
 * (DuckDB-WASM, read locally in the browser).
 */
export const EUNOMIA_CONCEPTS = {
  celecoxib: {
    conceptId: 1118084,
    conceptName: "celecoxib",
    domainId: "Drug",
    vocabularyId: "RxNorm",
    conceptClassId: "Ingredient",
    conceptCode: "140587",
    standardConcept: "S",
    includeDescendants: true,
  },
  diclofenac: {
    conceptId: 1124300,
    conceptName: "diclofenac",
    domainId: "Drug",
    vocabularyId: "RxNorm",
    conceptClassId: "Ingredient",
    conceptCode: "3355",
    standardConcept: "S",
    includeDescendants: true,
  },
  giHemorrhage: {
    conceptId: 192671,
    conceptName: "Gastrointestinal hemorrhage",
    domainId: "Condition",
    vocabularyId: "SNOMED",
    conceptClassId: "Clinical Finding",
    conceptCode: "74474003",
    standardConcept: "S",
    includeDescendants: true,
  },
} satisfies Record<string, ConceptRef>;

export const EUNOMIA_CONCEPT_LIST: ConceptRef[] = Object.values(EUNOMIA_CONCEPTS);

/** Negative control outcomes used in the Strategus example study. */
export const EUNOMIA_NEGATIVE_CONTROLS: NegativeControl[] = [
  { cohortId: 10037, name: "Concussion with loss of consciousness", outcomeConceptId: 375671 },
  { cohortId: 10038, name: "Child attention deficit disorder", outcomeConceptId: 440086 },
  { cohortId: 10039, name: "Urinary tract infection caused by Escherichia coli", outcomeConceptId: 4116491 },
  { cohortId: 10040, name: "Anemia", outcomeConceptId: 439777 },
  { cohortId: 10041, name: "Coronary arteriosclerosis", outcomeConceptId: 317576 },
  { cohortId: 10042, name: "Cardiac arrest", outcomeConceptId: 321042 },
  { cohortId: 10043, name: "Atrial fibrillation", outcomeConceptId: 313217 },
  { cohortId: 10044, name: "Alzheimer's disease", outcomeConceptId: 378419 },
  { cohortId: 10046, name: "Viral sinusitis", outcomeConceptId: 40481087 },
  { cohortId: 10047, name: "Myocardial infarction", outcomeConceptId: 4329847 },
  { cohortId: 10048, name: "Acute bacterial sinusitis", outcomeConceptId: 4294548 },
  { cohortId: 10049, name: "Polyp of colon", outcomeConceptId: 4285898 },
];

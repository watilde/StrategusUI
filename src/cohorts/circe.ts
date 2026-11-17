import type { AnyCohort, ConceptRef } from "../ir/schema";

/**
 * IR cohort -> Circe (ATLAS) cohort expression.
 *
 * Deliberately template-based: each IR cohort kind maps to exactly one Circe
 * shape. Free-form Circe editing is out of scope; for anything more complex,
 * reuse an existing definition (e.g. OHDSI PhenotypeLibrary) instead.
 */

type CirceConceptItem = {
  concept: {
    CONCEPT_ID: number;
    CONCEPT_NAME: string;
    DOMAIN_ID: string;
    VOCABULARY_ID: string;
    CONCEPT_CLASS_ID: string;
    CONCEPT_CODE: string;
    STANDARD_CONCEPT: string;
    STANDARD_CONCEPT_CAPTION: string;
    INVALID_REASON: string;
    INVALID_REASON_CAPTION: string;
  };
  isExcluded: boolean;
  includeDescendants: boolean;
  includeMapped: boolean;
};

const STANDARD_CAPTION: Record<string, string> = {
  S: "Standard",
  C: "Classification",
  "": "Non-Standard",
};

function conceptItem(c: ConceptRef): CirceConceptItem {
  return {
    concept: {
      CONCEPT_ID: c.conceptId,
      CONCEPT_NAME: c.conceptName,
      DOMAIN_ID: c.domainId,
      VOCABULARY_ID: c.vocabularyId,
      CONCEPT_CLASS_ID: c.conceptClassId,
      CONCEPT_CODE: c.conceptCode,
      STANDARD_CONCEPT: c.standardConcept,
      STANDARD_CONCEPT_CAPTION: STANDARD_CAPTION[c.standardConcept] ?? "",
      INVALID_REASON: "V",
      INVALID_REASON_CAPTION: "Valid",
    },
    isExcluded: false,
    includeDescendants: c.includeDescendants,
    includeMapped: false,
  };
}

export function toCirceExpression(cohort: AnyCohort): Record<string, unknown> {
  // Published definitions are used exactly as published.
  if (cohort.kind === "phenotype") return cohort.circe;

  const conceptSets = [
    { id: 0, name: cohort.name, expression: { items: cohort.concepts.map(conceptItem) } },
  ];
  const common = {
    ConceptSets: conceptSets,
    QualifiedLimit: { Type: "First" },
    ExpressionLimit: { Type: "First" },
    InclusionRules: [],
    CensoringCriteria: [],
    CollapseSettings: { CollapseType: "ERA", EraPad: 0 },
    CensorWindow: {},
    cdmVersionRange: ">=5.0.0",
  };

  switch (cohort.kind) {
    case "drug_new_user":
      return {
        ...common,
        PrimaryCriteria: {
          CriteriaList: [{ DrugEra: { CodesetId: 0 } }],
          ObservationWindow: { PriorDays: 0, PostDays: 0 },
          PrimaryCriteriaLimit: { Type: "First" },
        },
        EndStrategy: {
          CustomEra: { DrugCodesetId: 0, GapDays: cohort.eraGapDays, Offset: 0 },
        },
      };
    case "condition_first":
      return {
        ...common,
        PrimaryCriteria: {
          CriteriaList: [{ ConditionOccurrence: { CodesetId: 0, ConditionTypeExclude: false } }],
          ObservationWindow: { PriorDays: 0, PostDays: 0 },
          PrimaryCriteriaLimit: { Type: "First" },
        },
        EndStrategy: { DateOffset: { DateField: "StartDate", Offset: 0 } },
      };
  }
}

/** Serialized as Strategus expects: the cohort definition is a JSON *string*. */
export function toCirceJson(cohort: AnyCohort): string {
  return JSON.stringify(toCirceExpression(cohort), null, 2);
}
